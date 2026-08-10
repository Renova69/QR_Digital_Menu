import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Materializes verified GlossaryTerm rows into DeepL's native glossary API
 * so curated terminology is enforced INSIDE a sentence, not just on an
 * exact whole-string match (that's what GlossaryService already does,
 * cheaply, with zero DeepL characters spent — the two layers are
 * complementary and local-first is a real cost saving on a metered key).
 *
 * DO_NOT_TRANSLATE terms are enforced as identity glossary entries
 * (source -> source), deliberately NOT via XML/HTML tag_handling +
 * ignore_tags. Tag-wrapping requires mutating source text before sending
 * and stripping tags after; a dropped/reordered tag would corrupt a stored
 * menu name with no validator in this codebase positioned to catch it, and
 * markup inflates the billed character count away from what
 * TranslationUsageService records. An identity glossary entry has neither
 * risk and costs nothing extra per request (glossary_id is a bare param).
 *
 * DeepL glossaries are immutable — there is no "edit". A content change is
 * always create-new-then-delete-old, and in that order: never delete the
 * current glossary before the replacement is confirmed created, or a
 * failed create leaves the pair with no glossary at all.
 */
@Injectable()
export class DeepLGlossaryService {
  private readonly logger = new Logger(DeepLGlossaryService.name);

  private readonly http: AxiosInstance = axios.create({ timeout: 15_000 });

  // Cached for the process lifetime — this rarely changes and a stale
  // negative just means one pair falls back to no-glossary translation
  // until restart, never a hard failure.
  private supportedPairs: Set<string> | null = null;

  constructor(private readonly prisma: PrismaService) {}

  private get apiKey(): string | undefined {
    return process.env.DEEPL_API_KEY;
  }

  private get baseUrl(): string {
    return this.apiKey?.endsWith(':fx')
      ? 'https://api-free.deepl.com'
      : 'https://api.deepl.com';
  }

  private authHeaders() {
    return { Authorization: `DeepL-Auth-Key ${this.apiKey}` };
  }

  private async loadSupportedPairs(): Promise<Set<string>> {
    if (this.supportedPairs) return this.supportedPairs;
    try {
      const res = await this.http.get(
        `${this.baseUrl}/v2/glossary-language-pairs`,
        { headers: this.authHeaders() },
      );
      const pairs = new Set<string>(
        (res.data?.supported_languages ?? []).map(
          (p: any) =>
            `${String(p.source_lang).toLowerCase()}->${String(p.target_lang).toLowerCase()}`,
        ),
      );
      this.supportedPairs = pairs;
      return pairs;
    } catch (err) {
      this.logger.warn(
        `Could not load DeepL glossary-language-pairs — glossary support will be treated as unavailable this process: ${err instanceof Error ? err.message : String(err)}`,
      );
      // Empty set = "nothing supported" for this process, not a crash —
      // translation proceeds without a glossary, which only degrades
      // quality, never correctness.
      this.supportedPairs = new Set();
      return this.supportedPairs;
    }
  }

  private async isPairSupported(
    sourceLang: string,
    targetLang: string,
  ): Promise<boolean> {
    const pairs = await this.loadSupportedPairs();
    return pairs.has(
      `${sourceLang.toLowerCase()}->${targetLang.toLowerCase()}`,
    );
  }

  /** TSV entries for a (sourceLang, targetLang) pair from verified glossary
   * terms. DO_NOT_TRANSLATE rows become identity pairs. Entries containing
   * a literal tab/newline are dropped (DeepL's TSV format forbids them) —
   * none of our curated terms should ever hit this, but it's defensive
   * rather than a hard failure for one bad row. Entries over 1024 UTF-8
   * bytes (DeepL's per-entry limit) are dropped and logged, not fatal. */
  private async buildEntries(
    sourceLang: string,
    targetLang: string,
  ): Promise<{ tsv: string; count: number }> {
    const rows = await this.prisma.glossaryTerm.findMany({
      where: {
        sourceLang,
        targetLang,
        verified: true,
        kind: { in: ['TERM', 'PROTECTED_DISH', 'DO_NOT_TRANSLATE'] },
      },
      select: { sourceText: true, translatedText: true, kind: true },
      orderBy: { sourceText: 'asc' },
    });

    const lines: string[] = [];
    for (const row of rows) {
      const target =
        row.kind === 'DO_NOT_TRANSLATE' ? row.sourceText : row.translatedText;
      if (
        row.sourceText.includes('\t') ||
        row.sourceText.includes('\n') ||
        target.includes('\t') ||
        target.includes('\n')
      ) {
        this.logger.warn(
          `Skipping glossary entry with illegal TSV character: "${row.sourceText}"`,
        );
        continue;
      }
      if (
        Buffer.byteLength(row.sourceText, 'utf8') > 1024 ||
        Buffer.byteLength(target, 'utf8') > 1024
      ) {
        this.logger.warn(
          `Skipping oversized glossary entry (>1024 UTF-8 bytes): "${row.sourceText}"`,
        );
        continue;
      }
      lines.push(`${row.sourceText}\t${target}`);
    }
    return { tsv: lines.join('\n'), count: lines.length };
  }

  private contentHash(tsv: string): string {
    return crypto.createHash('md5').update(tsv).digest('hex');
  }

  /**
   * Returns a usable DeepL glossary_id for (sourceLang, targetLang), or
   * undefined if unavailable for any reason — unsupported pair, no
   * verified terms, or a DeepL API failure. Never throws: an unavailable
   * glossary must degrade translation quality, not block it.
   */
  async ensureGlossary(
    sourceLang: string,
    targetLang: string,
  ): Promise<string | undefined> {
    if (!this.apiKey) return undefined;

    const existing = await this.prisma.deepLGlossary.findUnique({
      where: { sourceLang_targetLang: { sourceLang, targetLang } },
    });
    const failureCooldownMs = 60 * 60 * 1000;
    if (
      !existing?.deeplGlossaryId &&
      existing?.lastError &&
      existing.updatedAt instanceof Date &&
      Date.now() - existing.updatedAt.getTime() < failureCooldownMs
    ) {
      return undefined;
    }

    if (!(await this.isPairSupported(sourceLang, targetLang))) return undefined;

    const { tsv, count } = await this.buildEntries(sourceLang, targetLang);
    if (count === 0) return undefined;
    const hash = this.contentHash(tsv);

    if (existing?.deeplGlossaryId && existing.contentHash === hash) {
      return existing.deeplGlossaryId;
    }

    try {
      const res = await this.http.post(
        `${this.baseUrl}/v2/glossaries`,
        {
          name: `qr-menu-${sourceLang}-${targetLang}`,
          source_lang: sourceLang.toUpperCase(),
          target_lang: targetLang.toUpperCase(),
          entries: tsv,
          entries_format: 'tsv',
        },
        { headers: this.authHeaders() },
      );
      const newId: string | undefined = res.data?.glossary_id;
      if (!newId)
        throw new Error('DeepL glossary create returned no glossary_id');

      await this.prisma.deepLGlossary.upsert({
        where: { sourceLang_targetLang: { sourceLang, targetLang } },
        create: {
          sourceLang,
          targetLang,
          deeplGlossaryId: newId,
          entryCount: count,
          contentHash: hash,
          syncedAt: new Date(),
        },
        update: {
          deeplGlossaryId: newId,
          entryCount: count,
          contentHash: hash,
          syncedAt: new Date(),
          lastError: null,
        },
      });

      // Best-effort delete of the superseded glossary — only AFTER the new
      // one is confirmed created and persisted. A failure here just leaks
      // one old glossary toward the 1000/account cap; the reaper cron
      // cleans those up.
      if (existing?.deeplGlossaryId && existing.deeplGlossaryId !== newId) {
        this.http
          .delete(`${this.baseUrl}/v2/glossaries/${existing.deeplGlossaryId}`, {
            headers: this.authHeaders(),
          })
          .catch((err) =>
            this.logger.warn(
              `Failed to delete superseded glossary ${existing.deeplGlossaryId}: ${err instanceof Error ? err.message : String(err)}`,
            ),
          );
      }

      return newId;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Failed to create/refresh DeepL glossary for ${sourceLang}->${targetLang}: ${message}`,
      );
      await this.prisma.deepLGlossary
        .upsert({
          where: { sourceLang_targetLang: { sourceLang, targetLang } },
          create: { sourceLang, targetLang, lastError: message },
          update: { lastError: message },
        })
        .catch(() => undefined);
      return undefined;
    }
  }

  /** Daily reconcile: rebuild any pair whose content drifted, and delete
   * any DeepL-side glossary not referenced by our table (a leak reaper —
   * e.g. from a create that succeeded but whose DB upsert then failed). */
  async reconcileAll(): Promise<void> {
    if (!this.apiKey) return;
    const pairs = await this.prisma.glossaryTerm.findMany({
      where: { verified: true },
      select: { sourceLang: true, targetLang: true },
      distinct: ['sourceLang', 'targetLang'],
    });
    for (const { sourceLang, targetLang } of pairs) {
      await this.ensureGlossary(sourceLang, targetLang);
    }

    try {
      const res = await this.http.get(`${this.baseUrl}/v2/glossaries`, {
        headers: this.authHeaders(),
      });
      const known = new Set(
        (
          await this.prisma.deepLGlossary.findMany({
            select: { deeplGlossaryId: true },
          })
        )
          .map((r) => r.deeplGlossaryId)
          .filter((id): id is string => !!id),
      );
      const remote: Array<{ glossary_id: string; name: string }> =
        res.data?.glossaries ?? [];
      for (const g of remote) {
        if (g.name.startsWith('qr-menu-') && !known.has(g.glossary_id)) {
          await this.http
            .delete(`${this.baseUrl}/v2/glossaries/${g.glossary_id}`, {
              headers: this.authHeaders(),
            })
            .catch(() => undefined);
        }
      }
    } catch (err) {
      this.logger.warn(
        `Glossary leak-reaper listing failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}

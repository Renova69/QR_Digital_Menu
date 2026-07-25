import { Module } from '@nestjs/common';
import { TranslationService } from './translation.service';
import { TRANSLATION_PROVIDER } from './translation-provider.interface';
import { DeepLProvider } from './providers/deepl.provider';
import { GlossaryService } from './glossary.service';
import { TranslationUsageService } from './translation-usage.service';
import { TranslationQuotaService } from './translation-quota.service';
import { DeepLGlossaryService } from './deepl-glossary.service';

// DeepL is the only supported provider. The self-hosted NLLB engine was
// removed — it hallucinated badly on short/rare menu vocabulary, which is
// exactly the content this feature translates most.
@Module({
  providers: [
    DeepLProvider,
    { provide: TRANSLATION_PROVIDER, useExisting: DeepLProvider },
    GlossaryService,
    TranslationService,
    TranslationUsageService,
    TranslationQuotaService,
    DeepLGlossaryService,
  ],
  exports: [
    TranslationService,
    TranslationUsageService,
    TranslationQuotaService,
    DeepLGlossaryService,
  ],
})
export class TranslationModule {}

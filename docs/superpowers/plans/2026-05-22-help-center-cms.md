# Help Center CMS — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move all Help/FAQ content from hardcoded i18n JSON into a database-driven CMS accessible via super-admin page.

**Architecture:** New `HelpContent` Prisma model → `HelpContentService` + `HelpContentController` (public + super-admin CRUD) → `HelpCenterPage.tsx` CMS UI in super-admin. `LandingFAQ.tsx` and `HelpView.tsx` switch from i18n to API fetch.

**Tech Stack:** NestJS 11 + Prisma 6 + React 18 + TanStack Query + Tailwind v4 + Radix UI

---

### Task 1: Prisma model + migration

**Files:**

- Modify: `apps/backend/prisma/schema.prisma` — add HelpContent model
- Create: `apps/backend/prisma/migrations/*_help_content/migration.sql` — auto-generated

- [ ] **Step 1: Add HelpContent model to schema.prisma**

Append after the `PlatformSettings` model (line 452):

```prisma
model HelpContent {
  id          String   @id @default(uuid())
  section     String   // 'landing' | 'dashboard'
  categoryKey String   // e.g. 'getting-started', 'menu', 'general'
  itemKey     String   // unique key per item within its section+category
  sortOrder   Int      @default(0)
  locale      String   // 'en' | 'bg' | 'ro'
  title       String   // FAQ question or help section title
  body        String   // FAQ answer or help content (plain text or Markdown)
  active      Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@unique([section, categoryKey, itemKey, locale])
  @@map("help_content")
}
```

- [ ] **Step 2: Run Prisma migration**

```bash
cd apps/backend && npx prisma migrate dev --name add_help_content
```

Expected: Migration creates `help_content` table with composite unique index.

- [ ] **Step 3: Verify migration applied**

```bash
cd apps/backend && npx prisma db push --help > $null; npx prisma migrate status
```

Expected: Migration list shows `add_help_content` as applied.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/prisma/schema.prisma apps/backend/prisma/migrations/
git commit -m "feat: add HelpContent model for help/FAQ CMS"
```

---

### Task 2: Backend DTOs

**Files:**

- Create: `apps/backend/src/help-content/dto/create-help-content.dto.ts`
- Create: `apps/backend/src/help-content/dto/update-help-content.dto.ts`
- Create: `apps/backend/src/help-content/dto/reorder-help-content.dto.ts`

- [ ] **Step 1: Create DTO files**

Create directory structure first:

```bash
mkdir -p apps/backend/src/help-content/dto
```

- [ ] **Step 2: Write create-help-content.dto.ts**

```typescript
// apps/backend/src/help-content/dto/create-help-content.dto.ts
import {
  IsString,
  IsIn,
  IsInt,
  IsBoolean,
  IsOptional,
  Min,
} from "class-validator";

export class CreateHelpContentDto {
  @IsString()
  @IsIn(["landing", "dashboard"])
  section: string;

  @IsString()
  categoryKey: string;

  @IsString()
  itemKey: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsString()
  @IsIn(["en", "bg", "ro"])
  locale: string;

  @IsString()
  title: string;

  @IsString()
  body: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
```

- [ ] **Step 3: Write update-help-content.dto.ts**

```typescript
// apps/backend/src/help-content/dto/update-help-content.dto.ts
import { PartialType, OmitType } from "@nestjs/swagger";
import { CreateHelpContentDto } from "./create-help-content.dto";

export class UpdateHelpContentDto extends PartialType(
  OmitType(CreateHelpContentDto, [
    "section",
    "categoryKey",
    "itemKey",
    "locale",
  ] as const),
) {}
```

- [ ] **Step 4: Write reorder-help-content.dto.ts**

```typescript
// apps/backend/src/help-content/dto/reorder-help-content.dto.ts
import { Type } from "class-transformer";
import { IsArray, IsString, IsInt, Min, ValidateNested } from "class-validator";

class ReorderItem {
  @IsString()
  id: string;

  @IsInt()
  @Min(0)
  sortOrder: number;
}

export class ReorderHelpContentDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReorderItem)
  items: ReorderItem[];
}
```

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/help-content/
git commit -m "feat: add HelpContent DTOs with validation"
```

---

### Task 3: Backend HelpContentService

**Files:**

- Create: `apps/backend/src/help-content/help-content.service.ts`

- [ ] **Step 1: Write the unit test**

Create `apps/backend/src/help-content/help-content.service.spec.ts`:

```typescript
// apps/backend/src/help-content/help-content.service.spec.ts
import { Test, TestingModule } from "@nestjs/testing";
import { HelpContentService } from "./help-content.service";
import { PrismaService } from "../prisma/prisma.service";

describe("HelpContentService", () => {
  let service: HelpContentService;
  let prisma: PrismaService;

  const mockPrisma = {
    helpContent: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findFirst: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HelpContentService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<HelpContentService>(HelpContentService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  describe("findBySection", () => {
    it("should return items for a section sorted by sortOrder", async () => {
      const items = [
        {
          id: "1",
          section: "landing",
          categoryKey: "general",
          itemKey: "q1",
          sortOrder: 0,
          locale: "en",
          title: "What?",
          body: "Answer",
          active: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];
      mockPrisma.helpContent.findMany.mockResolvedValue(items);

      const result = await service.findBySection("landing");

      expect(result).toEqual(items);
      expect(mockPrisma.helpContent.findMany).toHaveBeenCalledWith({
        where: { section: "landing" },
        orderBy: { sortOrder: "asc" },
      });
    });
  });

  describe("findBySectionAndLocale", () => {
    it("should filter by section and locale, only active items", async () => {
      await service.findBySectionAndLocale("landing", "en");

      expect(mockPrisma.helpContent.findMany).toHaveBeenCalledWith({
        where: { section: "landing", locale: "en", active: true },
        orderBy: { sortOrder: "asc" },
      });
    });
  });

  describe("create", () => {
    it("should create a help content item", async () => {
      const dto = {
        section: "landing",
        categoryKey: "general",
        itemKey: "q9",
        locale: "en",
        title: "New?",
        body: "New answer",
      };
      const created = {
        id: "new-id",
        ...dto,
        sortOrder: 0,
        active: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockPrisma.helpContent.create.mockResolvedValue(created);

      const result = await service.create(dto as any);

      expect(result).toEqual(created);
    });
  });

  describe("update", () => {
    it("should update a help content item", async () => {
      const updated = { id: "1", title: "Updated" };
      mockPrisma.helpContent.update.mockResolvedValue(updated);

      const result = await service.update("1", { title: "Updated" });

      expect(result).toEqual(updated);
    });
  });

  describe("delete", () => {
    it("should delete a help content item", async () => {
      mockPrisma.helpContent.delete.mockResolvedValue({ id: "1" });

      const result = await service.delete("1");

      expect(result).toEqual({ id: "1" });
    });
  });

  describe("reorder", () => {
    it("should bulk update sortOrder", async () => {
      // Each update returns the updated record
      mockPrisma.helpContent.update.mockResolvedValue({
        id: "1",
        sortOrder: 0,
      });

      await service.reorder([
        { id: "1", sortOrder: 0 },
        { id: "2", sortOrder: 1 },
      ]);

      expect(mockPrisma.helpContent.update).toHaveBeenCalledTimes(2);
    });
  });

  describe("deleteByCategory", () => {
    it("should delete all items in a category", async () => {
      mockPrisma.helpContent.deleteMany.mockResolvedValue({ count: 3 });

      const result = await service.deleteByCategory("landing", "general");

      expect(mockPrisma.helpContent.deleteMany).toHaveBeenCalledWith({
        where: { section: "landing", categoryKey: "general" },
      });
      expect(result).toEqual({ count: 3 });
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/backend && npx jest src/help-content/help-content.service.spec.ts --no-coverage
```

Expected: FAIL — "Cannot find module './help-content.service'"

- [ ] **Step 3: Write the service**

```typescript
// apps/backend/src/help-content/help-content.service.ts
import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateHelpContentDto } from "./dto/create-help-content.dto";
import { UpdateHelpContentDto } from "./dto/update-help-content.dto";

@Injectable()
export class HelpContentService {
  constructor(private readonly prisma: PrismaService) {}

  findBySection(section: string) {
    return this.prisma.helpContent.findMany({
      where: { section },
      orderBy: { sortOrder: "asc" },
    });
  }

  findBySectionAndLocale(section: string, locale: string) {
    return this.prisma.helpContent.findMany({
      where: { section, locale, active: true },
      orderBy: { sortOrder: "asc" },
    });
  }

  create(dto: CreateHelpContentDto) {
    return this.prisma.helpContent.create({
      data: {
        ...dto,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
  }

  update(id: string, dto: UpdateHelpContentDto) {
    return this.prisma.helpContent.update({
      where: { id },
      data: dto,
    });
  }

  delete(id: string) {
    return this.prisma.helpContent.delete({
      where: { id },
    });
  }

  async reorder(items: { id: string; sortOrder: number }[]) {
    await this.prisma.$transaction(
      items.map(({ id, sortOrder }) =>
        this.prisma.helpContent.update({
          where: { id },
          data: { sortOrder },
        }),
      ),
    );
  }

  deleteByCategory(section: string, categoryKey: string) {
    return this.prisma.helpContent.deleteMany({
      where: { section, categoryKey },
    });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/backend && npx jest src/help-content/help-content.service.spec.ts --no-coverage
```

Expected: 6 of 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/help-content/help-content.service.ts apps/backend/src/help-content/help-content.service.spec.ts
git commit -m "feat: add HelpContentService with CRUD operations"
```

---

### Task 4: Backend HelpContentController

**Files:**

- Create: `apps/backend/src/help-content/help-content.controller.ts`

- [ ] **Step 1: Write the controller test**

Create `apps/backend/src/help-content/help-content.controller.spec.ts`:

```typescript
// apps/backend/src/help-content/help-content.controller.spec.ts
import { Test, TestingModule } from "@nestjs/testing";
import { HelpContentController } from "./help-content.controller";
import { HelpContentService } from "./help-content.service";

describe("HelpContentController", () => {
  let controller: HelpContentController;
  let service: HelpContentService;

  const mockService = {
    findBySection: jest.fn().mockResolvedValue([]),
    findBySectionAndLocale: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    reorder: jest.fn(),
    deleteByCategory: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HelpContentController],
      providers: [{ provide: HelpContentService, useValue: mockService }],
    }).compile();

    controller = module.get<HelpContentController>(HelpContentController);
    service = module.get<HelpContentService>(HelpContentService);
  });

  describe("GET /help-content/:section", () => {
    it("should return items for section filtered by locale query param", async () => {
      mockService.findBySectionAndLocale.mockResolvedValue([
        { id: "1", title: "Test" },
      ]);

      const result = await controller.getPublic("landing", "en");

      expect(mockService.findBySectionAndLocale).toHaveBeenCalledWith(
        "landing",
        "en",
      );
      expect(result).toEqual([{ id: "1", title: "Test" }]);
    });

    it("should default locale to en", async () => {
      await controller.getPublic("dashboard");

      expect(mockService.findBySectionAndLocale).toHaveBeenCalledWith(
        "dashboard",
        "en",
      );
    });
  });

  describe("GET /super-admin/help-content", () => {
    it("should return all items for section", async () => {
      mockService.findBySection.mockResolvedValue([{ id: "1" }, { id: "2" }]);

      const result = await controller.getAll("landing");

      expect(result).toHaveLength(2);
    });
  });

  describe("POST /super-admin/help-content", () => {
    it("should create an item", async () => {
      const dto = {
        section: "landing",
        categoryKey: "general",
        itemKey: "q1",
        locale: "en",
        title: "Q",
        body: "A",
      };
      mockService.create.mockResolvedValue({ id: "1", ...dto });

      const result = await controller.create(dto as any);

      expect(result).toHaveProperty("id", "1");
    });
  });

  describe("PATCH /super-admin/help-content/:id", () => {
    it("should update an item", async () => {
      mockService.update.mockResolvedValue({ id: "1", title: "Updated" });

      const result = await controller.update("1", { title: "Updated" });

      expect(result).toHaveProperty("title", "Updated");
    });
  });

  describe("DELETE /super-admin/help-content/:id", () => {
    it("should delete an item", async () => {
      mockService.delete.mockResolvedValue({ id: "1" });

      const result = await controller.delete("1");

      expect(result).toEqual({ id: "1" });
    });
  });

  describe("PATCH /super-admin/help-content/reorder", () => {
    it("should reorder items", async () => {
      await controller.reorder({ items: [{ id: "1", sortOrder: 0 }] });

      expect(mockService.reorder).toHaveBeenCalledWith([
        { id: "1", sortOrder: 0 },
      ]);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/backend && npx jest src/help-content/help-content.controller.spec.ts --no-coverage
```

Expected: FAIL — "Cannot find module './help-content.controller'"

- [ ] **Step 3: Write the controller**

```typescript
// apps/backend/src/help-content/help-content.controller.ts
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { SuperAdminGuard } from "../auth/super-admin.guard";
import { HelpContentService } from "./help-content.service";
import { CreateHelpContentDto } from "./dto/create-help-content.dto";
import { UpdateHelpContentDto } from "./dto/update-help-content.dto";
import { ReorderHelpContentDto } from "./dto/reorder-help-content.dto";

@Controller()
export class HelpContentController {
  constructor(private readonly helpContentService: HelpContentService) {}

  @Get("help-content/:section")
  getPublic(
    @Param("section") section: string,
    @Query("locale") locale?: string,
  ) {
    return this.helpContentService.findBySectionAndLocale(
      section,
      locale || "en",
    );
  }

  @UseGuards(JwtAuthGuard, SuperAdminGuard)
  @Get("super-admin/help-content")
  getAll(@Query("section") section: string) {
    return this.helpContentService.findBySection(section);
  }

  @UseGuards(JwtAuthGuard, SuperAdminGuard)
  @Post("super-admin/help-content")
  create(@Body() dto: CreateHelpContentDto) {
    return this.helpContentService.create(dto);
  }

  @UseGuards(JwtAuthGuard, SuperAdminGuard)
  @Patch("super-admin/help-content/:id")
  update(@Param("id") id: string, @Body() dto: UpdateHelpContentDto) {
    return this.helpContentService.update(id, dto);
  }

  @UseGuards(JwtAuthGuard, SuperAdminGuard)
  @Delete("super-admin/help-content/:id")
  delete(@Param("id") id: string) {
    return this.helpContentService.delete(id);
  }

  @UseGuards(JwtAuthGuard, SuperAdminGuard)
  @Patch("super-admin/help-content/reorder")
  reorder(@Body() dto: ReorderHelpContentDto) {
    return this.helpContentService.reorder(dto.items);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/backend && npx jest src/help-content/help-content.controller.spec.ts --no-coverage
```

Expected: 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/help-content/help-content.controller.ts apps/backend/src/help-content/help-content.controller.spec.ts
git commit -m "feat: add HelpContentController with public + super-admin routes"
```

---

### Task 5: Backend Module registration

**Files:**

- Create: `apps/backend/src/help-content/help-content.module.ts`
- Modify: `apps/backend/src/app.module.ts:24-25` — register HelpContentModule

- [ ] **Step 1: Write the module**

```typescript
// apps/backend/src/help-content/help-content.module.ts
import { Module } from "@nestjs/common";
import { HelpContentController } from "./help-content.controller";
import { HelpContentService } from "./help-content.service";

@Module({
  controllers: [HelpContentController],
  providers: [HelpContentService],
  exports: [HelpContentService],
})
export class HelpContentModule {}
```

- [ ] **Step 2: Register in app.module.ts**

Add import after `UsersDataModule` line (~line 26):

```typescript
import { HelpContentModule } from "./help-content/help-content.module";
```

Add `HelpContentModule` to the `imports` array, after `UsersDataModule`:

```typescript
UsersDataModule,
HelpContentModule,
AuthModule,
```

- [ ] **Step 3: Verify backend compiles**

```bash
cd apps/backend && npm run build
```

Expected: Build succeeds with no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/help-content/help-content.module.ts apps/backend/src/app.module.ts
git commit -m "feat: register HelpContentModule in app module"
```

---

### Task 6: Seed script

**Files:**

- Create: `apps/backend/prisma/seed-help-content.ts`
- Modify: `apps/backend/prisma/seed.ts` — call seed-help-content

- [ ] **Step 1: Write seed-help-content.ts**

The script inlines current i18n values as TypeScript constants and creates `HelpContent` rows for all 3 locales.

```typescript
// apps/backend/prisma/seed-help-content.ts
import { PrismaClient } from "@prisma/client";

const LANDING_FAQ: Array<{
  itemKey: string;
  en: { title: string; body: string };
  bg: { title: string; body: string };
  ro: { title: string; body: string };
}> = [
  {
    itemKey: "q1",
    en: {
      title: "What is QR Menu and how does it work?",
      body: "QR Menu turns every table into a digital ordering station. Customers scan a QR code, browse your full menu on their phone, place orders instantly, and pay by card — all from their browser. No app download, no account sign-up, no friction. Orders appear immediately in your dashboard, on the Kitchen Display, and in the Waiter POS.",
    },
    bg: {
      title: "Какво е QR Menu и как работи?",
      body: "QR Menu превръща всяка маса в дигитална станция за поръчки. Клиентите сканират QR код, разглеждат пълното меню на телефона си, правят поръчки и плащат с карта — директно от браузъра. Без изтегляне на приложение, без регистрация. Поръчките се появяват веднага в таблото за управление, кухненския дисплей и ПОС терминала.",
    },
    ro: {
      title: "Ce este QR Menu și cum funcționează?",
      body: "QR Menu transformă fiecare masă într-o stație digitală de comandă. Clienții scanează un cod QR, navighează prin meniul complet pe telefon, plasează comenzi instantaneu și plătesc cu cardul — totul din browser. Fără descărcare de aplicație, fără înregistrare. Comenzile apar imediat în tabloul de bord, pe afișajul de bucătărie și în POS.",
    },
  },
  {
    itemKey: "q2",
    en: {
      title: "Do I need special hardware or printers?",
      body: "No special hardware required. QR Menu is fully cloud-based — you only need a standard printer (any inkjet or laser) to print QR code cards on A4 paper. We provide three print templates (Classic, Premium, Minimal) formatted for clean 2×2 grid layouts. Tablets for Waiter POS and Kitchen Display are optional. Best part: your QR codes never change — update your menu, prices, or items anytime without reprinting.",
    },
    bg: {
      title: "Трябва ли ми специален хардуер или принтери?",
      body: "Не е необходим специален хардуер. QR Menu е изцяло облачно базиран — нужен ви е само стандартен принтер (мастилено-струен или лазерен), за да отпечатате QR кодове на А4. Предлагаме три шаблона за печат (Classic, Premium, Minimal) форматирани за чисти 2×2 решетки. Таблетите за ПОС и кухненски дисплей са по избор. Най-доброто: QR кодовете ви никога не се променят — обновявайте менюто, цените или артикулите по всяко време без препечатване.",
    },
    ro: {
      title: "Am nevoie de hardware sau imprimante speciale?",
      body: "Nu este necesar hardware special. QR Menu este complet bazat pe cloud — aveți nevoie doar de o imprimantă standard (inkjet sau laser) pentru a imprima coduri QR pe hârtie A4. Oferim trei șabloane de imprimare (Classic, Premium, Minimal) formatate pentru grile 2×2. Tabletele pentru POS și afișajul de bucătărie sunt opționale. Cel mai bun lucru: codurile QR nu se schimbă niciodată — actualizați meniul, prețurile sau articolele oricând fără reimprimare.",
    },
  },
  {
    itemKey: "q3",
    en: {
      title: "How much does it cost? Are there hidden fees?",
      body: "Plans start at €29/month (Starter), €79/month (Pro), and €199/month (Enterprise). There are no per-order commissions and no hidden platform fees. Stripe card processing fees (1.4% + €0.25 per EU transaction) are standard and go directly to Stripe, not us. All plans are billed monthly with no lock-in contracts — cancel anytime from the Billing portal.",
    },
    bg: {
      title: "Колко струва? Има ли скрити такси?",
      body: "Плановете започват от €29/месец (Starter), €79/месец (Pro) и €199/месец (Enterprise). Няма комисионни за поръчка и скрити такси. Таксите за обработка на карти през Stripe (1.4% + €0.25 на транзакция в ЕС) са стандартни и отиват директно в Stripe. Всички планове се таксуват месечно без дългосрочни договори — прекратете по всяко време от портала за фактуриране.",
    },
    ro: {
      title: "Cât costă? Există taxe ascunse?",
      body: "Abonamentele încep de la €29/lună (Starter), €79/lună (Pro) și €199/lună (Enterprise). Nu există comisioane per comandă și nici taxe ascunse de platformă. Taxele de procesare a cardurilor Stripe (1.4% + €0.25 per tranzacție UE) sunt standard și merg direct la Stripe, nu la noi. Toate abonamentele sunt facturate lunar fără contracte pe termen lung — anulați oricând din portalul de facturare.",
    },
  },
  {
    itemKey: "q4",
    en: {
      title: "How quickly can I go live?",
      body: "Most restaurants go live the same day. The setup takes under 30 minutes: create your restaurant profile, add your tables, build your menu (or import from an existing file), and print QR codes. No technical skills, no coding, no integration work needed. If you have an existing digital menu, our team can convert it for free.",
    },
    bg: {
      title: "Колко бързо мога да стартирам?",
      body: "Повечето ресторанти стартират в същия ден. Настройката отнема под 30 минути: създайте профил на ресторанта, добавете маси, изградете меню (или импортирайте от съществуващ файл) и отпечатайте QR кодове. Не са необходими технически умения, програмиране или интеграция. Ако имате съществуващо дигитално меню, нашият екип може да го конвертира безплатно.",
    },
    ro: {
      title: "Cât de repede pot deveni operațional?",
      body: "Majoritatea restaurantelor devin operaționale în aceeași zi. Configurarea durează sub 30 de minute: creați profilul restaurantului, adăugați mesele, construiți meniul (sau importați dintr-un fișier existent) și imprimați codurile QR. Nu sunt necesare abilități tehnice, programare sau lucrări de integrare. Dacă aveți deja un meniu digital, echipa noastră îl poate converti gratuit.",
    },
  },
  {
    itemKey: "q5",
    en: {
      title: "How do tableside payments and tipping work?",
      body: 'Customers tap "Request Bill" on their phone to see an itemized bill, select a tip percentage (you set the options — e.g., 5%, 10%, 15%), and pay securely by card via Stripe Connect. The payment processes in seconds and your dashboard updates instantly. Customers can also split the bill between up to 20 people. Waiters can close tables with card payments through the POS as well.',
    },
    bg: {
      title: "Как работят плащанията на масата и бакшишите?",
      body: 'Клиентите натискат "Заяви сметка" на телефона си, за да видят детайлна сметка, избират процент бакшиш (вие задавате опциите — напр. 5%, 10%, 15%) и плащат сигурно с карта чрез Stripe Connect. Плащането се обработва за секунди и таблото ви се обновява незабавно. Клиентите могат също да разделят сметката между до 20 души. Сервитьорите могат да приключат маси с картови плащания и през ПОС.',
    },
    ro: {
      title: "Cum funcționează plățile la masă și bacșișul?",
      body: 'Clienții apasă "Solicită nota de plată" pe telefon pentru a vedea o notă detaliată, selectează un procent de bacșiș (dvs. setați opțiunile — de ex., 5%, 10%, 15%) și plătesc sigur cu cardul prin Stripe Connect. Plata se procesează în câteva secunde, iar tabloul de bord se actualizează instantaneu. Clienții pot, de asemenea, să împartă nota între până la 20 de persoane. Chelnerii pot închide mesele cu plăți cu cardul și prin POS.',
    },
  },
  {
    itemKey: "q6",
    en: {
      title: "Which languages does the menu support?",
      body: 'Your menu auto-translates to English, Bulgarian, and Romanian via DeepL — the industry-leading neural machine translation engine. Add target languages in Settings, and new menu items translate automatically. Use "Translate All Now" to batch-translate your entire existing menu. Customers see the menu in their browser language without changing any settings.',
    },
    bg: {
      title: "Какви езици поддържа менюто?",
      body: 'Менюто ви се превежда автоматично на английски, български и румънски чрез DeepL — водещия невронен машинен превод. Добавете целеви езици в Настройки и новите артикули се превеждат автоматично. Използвайте "Преведи всичко сега" за пакетен превод на цялото меню. Клиентите виждат менюто на езика на браузъра си без да променят настройки.',
    },
    ro: {
      title: "Ce limbi suportă meniul?",
      body: 'Meniul dvs. se traduce automat în engleză, bulgară și română prin DeepL — motorul de traducere neurală de top. Adăugați limbile țintă în Setări, iar articolele noi se traduc automat. Utilizați "Traduceți tot acum" pentru traducerea în lot a întregului meniu existent. Clienții văd meniul în limba browserului lor fără a schimba setările.',
    },
  },
  {
    itemKey: "q7",
    en: {
      title: "What about customer data privacy and GDPR?",
      body: 'QR Menu is fully GDPR-compliant. We provide cookie consent banners for your public menu page, auto-generate /privacy and /terms routes, and include a one-click "Right to Erasure" button that permanently deletes customer emails, transaction history, and loyalty point ledgers. Customers log in with email OTP (one-time passcodes) — no passwords are ever stored. Deleted accounts cannot be recovered, ensuring complete data removal.',
    },
    bg: {
      title: "Ами поверителността на данните и GDPR?",
      body: 'QR Menu е напълно съвместим с GDPR. Предоставяме банери за съгласие за бисквитки за публичната страница на менюто, автоматично генерираме /privacy и /terms маршрути и включваме бутон "Право на изтриване" с едно кликване, който трайно изтрива имейли на клиенти, история на транзакции и регистри на точки за лоялност. Клиентите влизат с имейл OTP (еднократни кодове) — пароли никога не се съхраняват. Изтритите акаунти не могат да бъдат възстановени.',
    },
    ro: {
      title: "Cum rămâne cu confidențialitatea datelor și GDPR?",
      body: 'QR Menu este pe deplin conform cu GDPR. Oferim bannere de consimțământ pentru cookie-uri pentru pagina publică a meniului, generăm automat rutele /privacy și /terms și includem un buton "Dreptul la ștergere" cu un singur clic care șterge permanent e-mailurile clienților, istoricul tranzacțiilor și registrele de puncte de loialitate. Clienții se autentifică cu OTP prin e-mail (coduri de unică folosință) — parolele nu sunt niciodată stocate. Conturile șterse nu pot fi recuperate.',
    },
  },
  {
    itemKey: "q8",
    en: {
      title: "Can I try it before subscribing?",
      body: "Absolutely. Start with our free plan — it has no time limit and no credit card required. Build your digital menu, generate QR codes, and manage tables at no cost. When you are ready for advanced features like Stripe payments, loyalty programs, analytics, POS, and Kitchen Display, upgrade to a paid plan. You can upgrade or downgrade anytime.",
    },
    bg: {
      title: "Мога ли да го тествам преди да се абонирам?",
      body: "Абсолютно. Започнете с безплатния ни план — няма ограничение във времето и не се изисква кредитна карта. Изградете дигиталното си меню, генерирайте QR кодове и управлявайте маси безплатно. Когато сте готови за разширени функции като Stripe плащания, програми за лоялност, анализи, ПОС и кухненски дисплей, надградете до платен план. Можете да надграждате или понижавате по всяко време.",
    },
    ro: {
      title: "Pot încerca înainte de a mă abona?",
      body: "Absolut. Începeți cu planul nostru gratuit — nu are limită de timp și nu necesită card de credit. Construiți meniul digital, generați coduri QR și gestionați mesele fără costuri. Când sunteți pregătit pentru funcții avansate precum plăți Stripe, programe de loialitate, analize, POS și afișaj de bucătărie, faceți upgrade la un plan plătit. Puteți face upgrade sau downgrade oricând.",
    },
  },
];

const DASHBOARD_HELP: Array<{
  categoryKey: string;
  items: Array<{
    itemKey: string;
    en: { title: string; body: string };
    bg: { title: string; body: string };
    ro: { title: string; body: string };
  }>;
}> = [
  {
    categoryKey: "getting-started",
    items: [
      {
        itemKey: "create-menu",
        en: {
          title: "How do I create my first menu?",
          body: 'Go to Menu Editor, click "+ Add Category" to create a section (e.g., Appetizers, Main Courses), then click "+ Add Item" within each category. Fill in the item name, description, price, and optional image. Your menu is live immediately.',
        },
        bg: {
          title: "Как да създам първото си меню?",
          body: 'Отидете в Редактор на меню, натиснете "+ Добави категория" за да създадете секция (напр. Предястия, Основни ястия), след това натиснете "+ Добави артикул" във всяка категория. Попълнете име, описание, цена и по желание снимка. Менюто ви е активно веднага.',
        },
        ro: {
          title: "Cum creez primul meu meniu?",
          body: 'Mergeți la Editorul de meniu, faceți clic pe "+ Adaugă categorie" pentru a crea o secțiune (de ex., Aperitive, Feluri principale), apoi faceți clic pe "+ Adaugă articol" în fiecare categorie. Completați numele, descrierea, prețul și opțional o imagine. Meniul dvs. este live imediat.',
        },
      },
      {
        itemKey: "add-items",
        en: {
          title: "How do I add items to a category?",
          body: 'Expand a category in Menu Editor and click "+ Add Item". Each item needs a name and price. You can also add a description, upload an image, assign dietary tags, and add modifier options (like size or extras).',
        },
        bg: {
          title: "Как да добавя артикули към категория?",
          body: 'Разгънете категория в Редактора на меню и натиснете "+ Добави артикул". Всеки артикул се нуждае от име и цена. Можете също да добавите описание, снимка, диетични тагове и модификатори (като размер или екстри).',
        },
        ro: {
          title: "Cum adaug articole într-o categorie?",
          body: 'Extindeți o categorie în Editorul de meniu și faceți clic pe "+ Adaugă articol". Fiecare articol necesită un nume și un preț. Puteți adăuga, de asemenea, o descriere, o imagine, etichete dietetice și opțiuni de modificare (cum ar fi mărimea sau extra).',
        },
      },
    ],
  },
  {
    categoryKey: "qr-codes",
    items: [
      {
        itemKey: "print-qr",
        en: {
          title: "How do I print QR codes for my tables?",
          body: 'Go to Tables in the sidebar. Each table has a "Print QR" button. Choose a template (Classic, Premium, or Minimal), and print on A4 paper. Each QR code is permanently linked to its table — no need to reprint when you update your menu.',
        },
        bg: {
          title: "Как да отпечатам QR кодове за моите маси?",
          body: 'Отидете в Маси в страничното меню. Всяка маса има бутон "Печат QR". Изберете шаблон (Classic, Premium или Minimal) и отпечатайте на А4. Всеки QR код е трайно свързан с масата си — няма нужда от препечатване при обновяване на менюто.',
        },
        ro: {
          title: "Cum imprim coduri QR pentru mesele mele?",
          body: 'Mergeți la Mese în bara laterală. Fiecare masă are un buton "Imprimare QR". Alegeți un șablon (Classic, Premium sau Minimal) și imprimați pe hârtie A4. Fiecare cod QR este legat permanent de masa sa — nu este nevoie să reimprimați când actualizați meniul.',
        },
      },
    ],
  },
  {
    categoryKey: "orders",
    items: [
      {
        itemKey: "view-orders",
        en: {
          title: "Where do I see incoming orders?",
          body: 'Active orders appear in the Dashboard under "Live Orders" and also on the Kitchen Display if you have it open. You\'ll hear a notification sound for each new order. Click any order to see its details and update its status.',
        },
        bg: {
          title: "Къде виждам входящите поръчки?",
          body: 'Активните поръчки се появяват в Таблото под "Поръчки на живо" и също на Кухненския дисплей, ако е отворен. Ще чуете звук за известяване при всяка нова поръчка. Кликнете върху поръчка, за да видите детайли и да обновите статуса.',
        },
        ro: {
          title: "Unde văd comenzile primite?",
          body: 'Comenzile active apar în Tabloul de bord sub "Comenzi live" și, de asemenea, pe Afișajul de bucătărie dacă îl aveți deschis. Veți auzi un sunet de notificare pentru fiecare comandă nouă. Faceți clic pe orice comandă pentru a vedea detaliile și a actualiza statusul.',
        },
      },
    ],
  },
  {
    categoryKey: "payments",
    items: [
      {
        itemKey: "setup-payments",
        en: {
          title: "How do I set up Stripe payments?",
          body: 'Go to Settings → Payments and click "Connect Stripe". You\'ll be redirected to Stripe to complete onboarding. Once connected, your Stripe status will show as "Active" and customers can pay by card at their table.',
        },
        bg: {
          title: "Как да настроя Stripe плащания?",
          body: 'Отидете в Настройки → Плащания и натиснете "Свържи Stripe". Ще бъдете пренасочени към Stripe за завършване на регистрацията. След като сте свързани, статусът ви в Stripe ще показва "Активен" и клиентите могат да плащат с карта на масата.',
        },
        ro: {
          title: "Cum configurez plățile Stripe?",
          body: 'Mergeți la Setări → Plăți și faceți clic pe "Conectează Stripe". Veți fi redirecționat către Stripe pentru a finaliza înregistrarea. Odată conectat, statutul Stripe va apărea ca "Activ", iar clienții pot plăti cu cardul la masă.',
        },
      },
    ],
  },
  {
    categoryKey: "loyalty",
    items: [
      {
        itemKey: "loyalty-setup",
        en: {
          title: "How does the loyalty program work?",
          body: "Enable loyalty in Settings → Loyalty. Set your earn rate (points per €1 spent) and redeem rate (points needed for €1 discount). Customers automatically earn points on every order. They can redeem points at checkout for discounts. Points expire after 12 months of inactivity.",
        },
        bg: {
          title: "Как работи програмата за лоялност?",
          body: "Активирайте лоялността в Настройки → Лоялност. Задайте процент на печалба (точки за €1 похарчени) и процент на осребряване (точки за €1 отстъпка). Клиентите автоматично печелят точки за всяка поръчка. Могат да осребряват точки при плащане за отстъпки. Точките изтичат след 12 месеца неактивност.",
        },
        ro: {
          title: "Cum funcționează programul de loialitate?",
          body: "Activați loialitatea în Setări → Loialitate. Setați rata de câștig (puncte per 1€ cheltuit) și rata de răscumpărare (puncte necesare pentru 1€ reducere). Clienții câștigă automat puncte la fiecare comandă. Pot răscumpăra puncte la checkout pentru reduceri. Punctele expiră după 12 luni de inactivitate.",
        },
      },
    ],
  },
  {
    categoryKey: "translations",
    items: [
      {
        itemKey: "translate-menu",
        en: {
          title: "How do I translate my menu?",
          body: 'Go to Settings → Languages and add target languages (English, Bulgarian, Romanian). New items translate automatically via DeepL. Use "Translate All Now" to batch-translate your existing menu. Each item stores its translations in the database, so they persist across edits.',
        },
        bg: {
          title: "Как да преведа менюто си?",
          body: 'Отидете в Настройки → Езици и добавете целеви езици (английски, български, румънски). Новите артикули се превеждат автоматично чрез DeepL. Използвайте "Преведи всичко сега" за пакетен превод на съществуващото меню. Всеки артикул съхранява преводите си в базата данни.',
        },
        ro: {
          title: "Cum traduc meniul meu?",
          body: 'Mergeți la Setări → Limbi și adăugați limbile țintă (engleză, bulgară, română). Articolele noi se traduc automat prin DeepL. Utilizați "Traduceți tot acum" pentru traducerea în lot a meniului existent. Fiecare articol își stochează traducerile în baza de date.',
        },
      },
    ],
  },
  {
    categoryKey: "troubleshooting",
    items: [
      {
        itemKey: "orders-not-appearing",
        en: {
          title: "Orders are not appearing in my dashboard",
          body: 'First, check that your restaurant is set to "Active" in Settings. Then verify your internet connection. If orders still don\'t appear, try refreshing the page or logging out and back in. Contact support if the issue persists.',
        },
        bg: {
          title: "Поръчките не се появяват в таблото ми",
          body: 'Първо проверете дали ресторантът ви е "Активен" в Настройки. След това проверете интернет връзката си. Ако поръчките все още не се появяват, опитайте да опресните страницата или да излезете и влезете отново. Свържете се с поддръжката, ако проблемът продължава.',
        },
        ro: {
          title: "Comenzile nu apar în tabloul meu de bord",
          body: 'Mai întâi, verificați dacă restaurantul dvs. este setat ca "Activ" în Setări. Apoi verificați conexiunea la internet. Dacă comenzile tot nu apar, încercați să reîmprospătați pagina sau să vă deconectați și reconectați. Contactați suportul dacă problema persistă.',
        },
      },
    ],
  },
];

export async function seedHelpContent(prisma: PrismaClient) {
  console.log("Seeding help content...");

  const existing = await prisma.helpContent.count();
  if (existing > 0) {
    console.log(
      `  ${existing} help content rows already exist — skipping seed.`,
    );
    return;
  }

  let sortOrder = 0;

  // Seed landing FAQ items
  for (const faq of LANDING_FAQ) {
    for (const locale of ["en", "bg", "ro"] as const) {
      const loc = faq[locale];
      await prisma.helpContent.create({
        data: {
          section: "landing",
          categoryKey: "general",
          itemKey: faq.itemKey,
          sortOrder,
          locale,
          title: loc.title,
          body: loc.body,
          active: true,
        },
      });
    }
    sortOrder++;
  }

  // Seed dashboard help categories and items
  sortOrder = 0;
  for (const category of DASHBOARD_HELP) {
    for (const item of category.items) {
      for (const locale of ["en", "bg", "ro"] as const) {
        const loc = item[locale];
        await prisma.helpContent.create({
          data: {
            section: "dashboard",
            categoryKey: category.categoryKey,
            itemKey: item.itemKey,
            sortOrder,
            locale,
            title: loc.title,
            body: loc.body,
            active: true,
          },
        });
      }
      sortOrder++;
    }
  }

  const total = await prisma.helpContent.count();
  console.log(`  ${total} help content rows seeded.`);
}
```

- [ ] **Step 2: Wire into main seed script**

Read `apps/backend/prisma/seed.ts` to find the end, then add the import and call. The seed file typically ends with `prisma.$disconnect()`. Add before the disconnect:

```typescript
import { seedHelpContent } from "./seed-help-content";

// ... existing seed code ...

// At the end, before prisma.$disconnect():
await seedHelpContent(prisma);
```

- [ ] **Step 3: Run the seed**

```bash
cd apps/backend && npm run seed
```

Expected: Logs "Seeding help content..." and "XX help content rows seeded."

- [ ] **Step 4: Commit**

```bash
git add apps/backend/prisma/seed-help-content.ts apps/backend/prisma/seed.ts
git commit -m "feat: add help content seed with current i18n values"
```

---

### Task 7: Frontend API functions

**Files:**

- Modify: `apps/frontend/src/lib/api.ts` — add help content API functions

- [ ] **Step 1: Add help content API functions to api.ts**

Append after the GDPR/Legal helpers section (after line 458, before `export default api`):

```typescript
// ── Help Content ──────────────────────────────────────────────────────────────

export interface HelpContentItem {
  id: string;
  section: "landing" | "dashboard";
  categoryKey: string;
  itemKey: string;
  sortOrder: number;
  locale: "en" | "bg" | "ro";
  title: string;
  body: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export const getHelpContent = (
  section: "landing" | "dashboard",
  locale?: string,
) =>
  api
    .get(`/help-content/${section}`, {
      params: locale ? { locale } : undefined,
    })
    .then((r) => r.data as HelpContentItem[]);

export const getAdminHelpContent = (section: string) =>
  api
    .get("/super-admin/help-content", { params: { section } })
    .then((r) => r.data as HelpContentItem[]);

export const createHelpContent = (dto: {
  section: string;
  categoryKey: string;
  itemKey: string;
  sortOrder?: number;
  locale: string;
  title: string;
  body: string;
  active?: boolean;
}) =>
  api
    .post("/super-admin/help-content", dto)
    .then((r) => r.data as HelpContentItem);

export const updateHelpContent = (
  id: string,
  dto: { title?: string; body?: string; sortOrder?: number; active?: boolean },
) =>
  api
    .patch(`/super-admin/help-content/${id}`, dto)
    .then((r) => r.data as HelpContentItem);

export const deleteHelpContent = (id: string) =>
  api.delete(`/super-admin/help-content/${id}`).then((r) => r.data);

export const reorderHelpContent = (
  items: { id: string; sortOrder: number }[],
) =>
  api.patch("/super-admin/help-content/reorder", { items }).then((r) => r.data);
```

- [ ] **Step 2: Verify frontend still compiles**

```bash
cd apps/frontend && npx tsc --noEmit --pretty
```

Expected: No new type errors.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/lib/api.ts
git commit -m "feat: add help content API functions to frontend client"
```

---

### Task 8: Frontend HelpCenterPage.tsx — CMS UI

**Files:**

- Create: `apps/frontend/src/pages/super-admin/HelpCenterPage.tsx`

- [ ] **Step 1: Write the CMS page component**

This is the largest new file. It reuses patterns from `LegalSettingsPage.tsx` (SectionCard, LocaleTextEditor, ToggleRow). The component has two sub-tabs: Landing FAQ and Dashboard Help.

```tsx
// apps/frontend/src/pages/super-admin/HelpCenterPage.tsx
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Pencil,
  Trash2,
  GripVertical,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import {
  getAdminHelpContent,
  createHelpContent,
  updateHelpContent,
  deleteHelpContent,
  type HelpContentItem,
} from "../../lib/api";

type Tab = "landing" | "dashboard";
type Locale = "en" | "bg" | "ro";

const LOCALES: { key: Locale; label: string }[] = [
  { key: "en", label: "EN" },
  { key: "bg", label: "BG" },
  { key: "ro", label: "RO" },
];

function groupBy<T>(items: T[], key: keyof T): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = String(item[key]);
    const group = map.get(k) || [];
    group.push(item);
    map.set(k, group);
  }
  return map;
}

function LocaleTabs({
  active,
  onChange,
}: {
  active: Locale;
  onChange: (l: Locale) => void;
}) {
  return (
    <div className="flex gap-1">
      {LOCALES.map(({ key, label }) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${
            active === key
              ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/25"
              : "bg-slate-800/40 text-slate-500 hover:text-slate-300 border border-transparent"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

interface EditDialogProps {
  item: HelpContentItem | null; // null = create new
  defaultSection: Tab;
  defaultCategoryKey?: string;
  onClose: () => void;
}

function EditDialog({
  item,
  defaultSection,
  defaultCategoryKey,
  onClose,
}: EditDialogProps) {
  const queryClient = useQueryClient();
  const isCreate = item === null;
  const [locale, setLocale] = useState<Locale>("en");

  // Read translations from item for current locale, or empty strings
  const existingLocales = isCreate
    ? ({} as Record<Locale, { title: string; body: string }>)
    : (Object.fromEntries(
        (
          queryClient.getQueryData<HelpContentItem[]>([
            "admin-help-content",
            item!.section,
          ]) || []
        )
          .filter(
            (i) =>
              i.categoryKey === item!.categoryKey &&
              i.itemKey === item!.itemKey,
          )
          .map((i) => [i.locale, { title: i.title, body: i.body }]),
      ) as Record<Locale, { title: string; body: string }>);

  const [forms, setForms] = useState<
    Record<Locale, { title: string; body: string }>
  >({
    en: existingLocales.en || { title: "", body: "" },
    bg: existingLocales.bg || { title: "", body: "" },
    ro: existingLocales.ro || { title: "", body: "" },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const section = item?.section || defaultSection;
      const categoryKey = item?.categoryKey || defaultCategoryKey || "general";
      const baseKey = item?.itemKey || `item-${Date.now()}`;
      for (const loc of LOCALES) {
        const f = forms[loc.key];
        if (f.title || f.body) {
          await createHelpContent({
            section,
            categoryKey,
            itemKey: baseKey,
            locale: loc.key,
            title: f.title || "",
            body: f.body || "",
          });
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-help-content"] });
      onClose();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!item) return;
      const sameKeyItems = (
        queryClient.getQueryData<HelpContentItem[]>([
          "admin-help-content",
          item.section,
        ]) || []
      ).filter(
        (i) => i.categoryKey === item.categoryKey && i.itemKey === item.itemKey,
      );
      for (const loc of LOCALES) {
        const f = forms[loc.key];
        const existing = sameKeyItems.find((i) => i.locale === loc.key);
        if (existing) {
          await updateHelpContent(existing.id, {
            title: f.title,
            body: f.body,
          });
        } else if (f.title || f.body) {
          await createHelpContent({
            section: item.section,
            categoryKey: item.categoryKey,
            itemKey: item.itemKey,
            locale: loc.key,
            title: f.title || "",
            body: f.body || "",
          });
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-help-content"] });
      onClose();
    },
  });

  const handleSave = () => {
    if (isCreate) {
      createMutation.mutate();
    } else {
      updateMutation.mutate();
    }
  };

  const isLoading = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-[#020617] border border-slate-800 rounded-xl w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <h3 className="font-bold text-sm text-white">
            {isCreate ? "Create Help Item" : "Edit Help Item"}
          </h3>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-white transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="px-5 py-3 border-b border-slate-800">
          <LocaleTabs active={locale} onChange={setLocale} />
        </div>

        <div className="p-5 flex flex-col gap-4">
          <div>
            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
              Title
            </label>
            <input
              value={forms[locale].title}
              onChange={(e) =>
                setForms((prev) => ({
                  ...prev,
                  [locale]: { ...prev[locale], title: e.target.value },
                }))
              }
              className="w-full bg-[#0d1117] border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50"
              placeholder="Question or section title"
            />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
              Body
            </label>
            <textarea
              value={forms[locale].body}
              onChange={(e) =>
                setForms((prev) => ({
                  ...prev,
                  [locale]: { ...prev[locale], body: e.target.value },
                }))
              }
              rows={4}
              className="w-full bg-[#0d1117] border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50 resize-none"
              placeholder="Answer or help content"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-800">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-md text-xs font-semibold text-slate-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isLoading}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-md text-xs font-bold text-white transition-colors"
          >
            {isLoading ? "Saving..." : `Save (${locale.toUpperCase()})`}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function HelpCenterPage() {
  const [tab, setTab] = useState<Tab>("landing");
  const [editItem, setEditItem] = useState<HelpContentItem | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createCategory, setCreateCategory] = useState("");
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(),
  );
  const queryClient = useQueryClient();

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["admin-help-content", tab],
    queryFn: () => getAdminHelpContent(tab),
  });

  const deleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      for (const id of ids) {
        await deleteHelpContent(id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-help-content"] });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      updateHelpContent(id, { active }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-help-content"] });
    },
  });

  const landingItems =
    tab === "landing"
      ? groupBy(items, "itemKey")
      : new Map<string, HelpContentItem[]>();
  const dashboardCategories =
    tab === "dashboard"
      ? groupBy(items, "categoryKey")
      : new Map<string, HelpContentItem[]>();

  const handleDelete = (itemKey: string, ids: string[]) => {
    if (confirm(`Delete "${itemKey}" and all its translations?`)) {
      deleteMutation.mutate(ids);
    }
  };

  const handleDeleteCategory = (categoryKey: string) => {
    const catItems = dashboardCategories.get(categoryKey) || [];
    const ids = catItems.map((i) => i.id);
    if (
      confirm(
        `Delete category "${categoryKey}" and all ${catItems.length} items?`,
      )
    ) {
      deleteMutation.mutate(ids);
    }
  };

  const toggleCategory = (key: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div>
      <div className="mb-2">
        <h1 className="text-xl font-bold text-white">Help Center</h1>
        <p className="text-xs text-slate-500 mt-1">
          Manage all help and FAQ content across the platform — no redeployment
          needed.
        </p>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-2 mb-6">
        {[
          { key: "landing" as Tab, label: "Landing FAQ" },
          { key: "dashboard" as Tab, label: "Dashboard Help" },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors border ${
              tab === key
                ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/25"
                : "bg-slate-800/40 text-slate-400 hover:text-slate-200 border-transparent"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="text-slate-500 text-sm py-12 text-center">
          Loading...
        </div>
      ) : (
        <>
          {/* Landing FAQ tab */}
          {tab === "landing" && (
            <div className="bg-[#020617] border border-slate-800 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <h2 className="text-sm font-semibold text-white">FAQ Items</h2>
                <span className="text-[10px] text-slate-500 bg-slate-800 px-2 py-0.5 rounded-full">
                  {landingItems.size} items
                </span>
                <button
                  onClick={() => {
                    setCreateCategory("general");
                    setCreateOpen(true);
                  }}
                  className="ml-auto px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 rounded-md text-[11px] font-bold text-white transition-colors flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" /> Add Item
                </button>
              </div>

              <div className="space-y-2">
                {Array.from(landingItems.entries())
                  .sort(
                    ([, a], [, b]) =>
                      (a[0]?.sortOrder ?? 0) - (b[0]?.sortOrder ?? 0),
                  )
                  .map(([itemKey, localeItems]) => {
                    const enItem = localeItems.find((i) => i.locale === "en");
                    const ids = localeItems.map((i) => i.id);
                    const isActive = localeItems.some((i) => i.active);
                    const localesPresent = localeItems.map((i) =>
                      i.locale.toUpperCase(),
                    );

                    return (
                      <div
                        key={itemKey}
                        className="bg-[#0d1117] border border-slate-800/60 rounded-lg p-3 flex items-center justify-between group"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-medium text-slate-200 truncate">
                              {enItem?.title || itemKey}
                            </span>
                            <div className="flex gap-1">
                              {localesPresent.map((loc) => (
                                <span
                                  key={loc}
                                  className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                                    loc === "EN"
                                      ? "bg-emerald-500/15 text-emerald-400"
                                      : "bg-slate-800 text-slate-500"
                                  }`}
                                >
                                  {loc}
                                </span>
                              ))}
                            </div>
                          </div>
                          {enItem?.body && (
                            <p className="text-[11px] text-slate-500 truncate">
                              {enItem.body}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 ml-4 shrink-0">
                          <button
                            onClick={() =>
                              toggleMutation.mutate({
                                id: ids[0],
                                active: !isActive,
                              })
                            }
                            className={`w-8 h-4 rounded-full transition-colors relative ${
                              isActive ? "bg-emerald-600" : "bg-slate-700"
                            }`}
                          >
                            <div
                              className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-transform ${
                                isActive ? "left-[18px]" : "left-[2px]"
                              }`}
                            />
                          </button>
                          <button
                            onClick={() =>
                              setEditItem(enItem || localeItems[0])
                            }
                            className="text-slate-500 hover:text-slate-300 transition-colors"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(itemKey, ids)}
                            className="text-slate-500 hover:text-red-400 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* Dashboard Help tab */}
          {tab === "dashboard" && (
            <div className="bg-[#020617] border border-slate-800 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <h2 className="text-sm font-semibold text-white">
                  Dashboard Help Categories
                </h2>
                <button
                  onClick={() => {
                    setCreateCategory("");
                    setCreateOpen(true);
                  }}
                  className="ml-auto px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 rounded-md text-[11px] font-bold text-white transition-colors flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" /> Add Category
                </button>
              </div>

              <div className="space-y-1.5">
                {Array.from(dashboardCategories.entries()).map(
                  ([categoryKey, catItems]) => {
                    const isExpanded = expandedCategories.has(categoryKey);
                    const groupedItems = groupBy(catItems, "itemKey");

                    return (
                      <div
                        key={categoryKey}
                        className="bg-[#0d1117] border border-slate-800/60 rounded-lg overflow-hidden"
                      >
                        <button
                          onClick={() => toggleCategory(categoryKey)}
                          className="w-full flex items-center gap-2 px-4 py-3 hover:bg-slate-800/30 transition-colors"
                        >
                          {isExpanded ? (
                            <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                          ) : (
                            <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                          )}
                          <span className="text-xs font-semibold text-slate-200">
                            {categoryKey}
                          </span>
                          <span className="text-[10px] text-slate-600 bg-slate-800 px-1.5 py-0.5 rounded">
                            {groupedItems.size} items
                          </span>
                          <div
                            className="ml-auto flex gap-1.5"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              onClick={() => {
                                const enItem = catItems.find(
                                  (i) => i.locale === "en",
                                );
                                if (enItem) setEditItem(enItem);
                              }}
                              className="text-slate-500 hover:text-slate-300 transition-colors p-0.5"
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => handleDeleteCategory(categoryKey)}
                              className="text-slate-500 hover:text-red-400 transition-colors p-0.5"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </button>

                        {isExpanded && (
                          <div className="border-t border-slate-800/40">
                            {Array.from(groupedItems.entries()).map(
                              ([itemKey, localeItems]) => {
                                const enItem = localeItems.find(
                                  (i) => i.locale === "en",
                                );
                                const ids = localeItems.map((i) => i.id);

                                return (
                                  <div
                                    key={itemKey}
                                    className="flex items-center justify-between px-4 py-2 hover:bg-slate-800/20 transition-colors border-b border-slate-800/20 last:border-b-0"
                                  >
                                    <span className="text-[11px] text-slate-300 pl-5">
                                      {enItem?.title || itemKey}
                                    </span>
                                    <div className="flex gap-1.5">
                                      <button
                                        onClick={() => {
                                          if (enItem) setEditItem(enItem);
                                        }}
                                        className="text-slate-500 hover:text-slate-300 transition-colors p-0.5"
                                      >
                                        <Pencil className="w-3 h-3" />
                                      </button>
                                      <button
                                        onClick={() =>
                                          handleDelete(itemKey, ids)
                                        }
                                        className="text-slate-500 hover:text-red-400 transition-colors p-0.5"
                                      >
                                        <Trash2 className="w-3 h-3" />
                                      </button>
                                    </div>
                                  </div>
                                );
                              },
                            )}
                            <button
                              onClick={() => {
                                setCreateCategory(categoryKey);
                                setCreateOpen(true);
                              }}
                              className="w-full text-left px-4 py-2 text-[11px] text-slate-500 hover:text-slate-300 transition-colors"
                            >
                              + Add help item
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  },
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* Edit/Create dialog */}
      {(editItem || createOpen) && (
        <EditDialog
          item={editItem}
          defaultSection={tab}
          defaultCategoryKey={createCategory}
          onClose={() => {
            setEditItem(null);
            setCreateOpen(false);
            setCreateCategory("");
          }}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd apps/frontend && npx tsc --noEmit --pretty
```

Expected: No errors. Fix any type issues.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/pages/super-admin/HelpCenterPage.tsx
git commit -m "feat: add HelpCenterPage CMS UI with landing FAQ and dashboard help tabs"
```

---

### Task 9: Frontend Routes — SuperAdminLayout + App.tsx

**Files:**

- Modify: `apps/frontend/src/pages/super-admin/SuperAdminLayout.tsx:1` — add import, nav item
- Modify: `apps/frontend/src/App.tsx` — add route and import

- [ ] **Step 1: Add nav item to SuperAdminLayout.tsx**

Change the imports line to include `MessageCircleQuestion`:

```typescript
import {
  LayoutDashboard,
  Building2,
  LogOut,
  Menu,
  X,
  ShieldCheck,
  Shield,
  MessageCircleQuestion,
} from "lucide-react";
```

Add one entry to `NAV_ITEMS` after Legal & GDPR:

```typescript
const NAV_ITEMS = [
  { to: "/super-admin", icon: LayoutDashboard, label: "Overview", end: true },
  { to: "/super-admin/tenants", icon: Building2, label: "Tenants" },
  { to: "/super-admin/legal", icon: ShieldCheck, label: "Legal & GDPR" },
  {
    to: "/super-admin/help",
    icon: MessageCircleQuestion,
    label: "Help Center",
  },
];
```

- [ ] **Step 2: Add route to App.tsx**

Read `apps/frontend/src/App.tsx` to find the super-admin route group. Add import:

```typescript
import HelpCenterPage from "./pages/super-admin/HelpCenterPage";
```

Add route inside the super-admin `<Routes>` block, after the legal route:

```tsx
<Route
  path="help"
  element={
    <SuperAdminRoute>
      <HelpCenterPage />
    </SuperAdminRoute>
  }
/>
```

- [ ] **Step 3: Verify frontend compiles**

```bash
cd apps/frontend && npx tsc --noEmit --pretty
```

Expected: No errors. Fix any import issues.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/pages/super-admin/SuperAdminLayout.tsx apps/frontend/src/App.tsx
git commit -m "feat: add Help Center route to super-admin sidebar and app"
```

---

### Task 10: Migrate LandingFAQ.tsx to API consumer

**Files:**

- Modify: `apps/frontend/src/components/landing/LandingFAQ.tsx` — replace i18n with API fetch

- [ ] **Step 1: Rewrite LandingFAQ.tsx**

Replace entire file content. Keep the same accordion animation and visual structure, but fetch data from API:

```tsx
import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { HelpCircle, ChevronDown } from "lucide-react";
import { getHelpContent, type HelpContentItem } from "../../lib/api";

function groupByItemKey(
  items: HelpContentItem[],
): Map<string, HelpContentItem[]> {
  const map = new Map<string, HelpContentItem[]>();
  for (const item of items) {
    const group = map.get(item.itemKey) || [];
    group.push(item);
    map.set(item.itemKey, group);
  }
  return map;
}

const LandingFAQ = () => {
  const { t, i18n } = useTranslation();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const answerRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const currentLang = i18n.language?.split("-")[0] || "en";
  const locale = ["en", "bg", "ro"].includes(currentLang) ? currentLang : "en";

  const { data: items = [] } = useQuery({
    queryKey: ["help-content", "landing", locale],
    queryFn: () => getHelpContent("landing", locale),
    staleTime: 5 * 60 * 1000,
  });

  const grouped = groupByItemKey(items);

  useEffect(() => {
    answerRefs.current.forEach((el, id) => {
      if (id === expandedId) {
        el.style.maxHeight = el.scrollHeight + "px";
        el.style.opacity = "1";
      } else {
        el.style.maxHeight = "0px";
        el.style.opacity = "0";
      }
    });
  }, [expandedId]);

  const toggleFaq = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  // Build sorted FAQ list
  const faqList = Array.from(grouped.entries())
    .sort(([, a], [, b]) => (a[0]?.sortOrder ?? 0) - (b[0]?.sortOrder ?? 0))
    .map(([itemKey, localeItems]) => {
      const item = localeItems[0]; // already filtered by locale from API
      return { id: itemKey, title: item.title, body: item.body };
    });

  return (
    <section className="relative py-24 md:py-32 border-t border-border bg-secondary/30">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        <div className="text-center mb-16 md:mb-20">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/10 text-accent text-[10px] font-black uppercase tracking-[0.15em] mb-4 border border-accent/20">
            <HelpCircle className="w-3.5 h-3.5" />
            {t("landing.faq.badge", "Got Questions?")}
          </div>
          <h2 className="text-3xl sm:text-4xl md:text-6xl font-serif font-black text-foreground tracking-tight mb-4">
            {t("landing.faq.title", "Frequently Asked Questions")}
          </h2>
          <p className="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto font-medium">
            {t(
              "landing.faq.subtitle",
              "Everything you need to know before getting started.",
            )}
          </p>
        </div>

        {/* FAQ accordion */}
        {faqList.length > 0 ? (
          <div className="space-y-3">
            {faqList.map((faq) => {
              const isExpanded = expandedId === faq.id;
              return (
                <div
                  key={faq.id}
                  className="group glass-panel rounded-2xl border border-border/50 hover:border-accent/20 overflow-hidden transition-all duration-300 ease-out motion-safe:hover:shadow-[0_10px_30px_-10px_var(--color-accent)/0.1]"
                >
                  <button
                    onClick={() => toggleFaq(faq.id)}
                    className="w-full flex items-center justify-between gap-4 p-5 md:p-6 text-left font-semibold text-sm md:text-base text-foreground cursor-pointer"
                    aria-expanded={isExpanded}
                  >
                    <span className="leading-snug pr-4">{faq.title}</span>
                    <ChevronDown
                      className={`w-5 h-5 shrink-0 transition-all duration-300 ease-out ${
                        isExpanded
                          ? "rotate-180 text-accent"
                          : "text-muted-foreground"
                      }`}
                    />
                  </button>

                  <div
                    ref={(el) => {
                      if (el) answerRefs.current.set(faq.id, el);
                    }}
                    className="overflow-hidden transition-all duration-300 ease-out"
                    style={{ maxHeight: "0px", opacity: "0" }}
                  >
                    <div className="px-5 md:px-6 pb-5 md:pb-6">
                      <p className="text-sm md:text-base text-muted-foreground leading-relaxed">
                        {faq.body}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-center text-muted-foreground text-sm">
            No FAQ items available yet.
          </p>
        )}
      </div>
    </section>
  );
};

export default LandingFAQ;
```

- [ ] **Step 2: Verify frontend compiles**

```bash
cd apps/frontend && npx tsc --noEmit --pretty
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/components/landing/LandingFAQ.tsx
git commit -m "feat: migrate LandingFAQ from i18n to API-driven content"
```

---

### Task 11: Migrate HelpView.tsx to API consumer

**Files:**

- Modify: `apps/frontend/src/pages/Dashboard/HelpView.tsx` — replace i18n with API fetch

- [ ] **Step 1: Rewrite HelpView.tsx**

Replace entire file content. Keep existing accordion, search, and visual structure, but fetch from API:

```tsx
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import {
  Search,
  ChevronDown,
  ChevronRight,
  HelpCircle,
  BookOpen,
  ExternalLink,
} from "lucide-react";
import { getHelpContent, type HelpContentItem } from "../../lib/api";

function groupBy<T>(items: T[], key: keyof T): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = String(item[key]);
    const group = map.get(k) || [];
    group.push(item);
    map.set(k, group);
  }
  return map;
}

const HelpView = () => {
  const { t, i18n } = useTranslation();
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [expandedItem, setExpandedItem] = useState<string | null>(null);

  const currentLang = i18n.language?.split("-")[0] || "en";
  const locale = ["en", "bg", "ro"].includes(currentLang) ? currentLang : "en";

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["help-content", "dashboard", locale],
    queryFn: () => getHelpContent("dashboard", locale),
    staleTime: 5 * 60 * 1000,
  });

  const categories = groupBy(items, "categoryKey");

  // Filter by search term
  const filteredCategories = new Map<string, HelpContentItem[]>();
  for (const [catKey, catItems] of categories) {
    if (!searchTerm) {
      filteredCategories.set(catKey, catItems);
      continue;
    }
    const lower = searchTerm.toLowerCase();
    const matching = catItems.filter(
      (i) =>
        i.title.toLowerCase().includes(lower) ||
        i.body.toLowerCase().includes(lower) ||
        catKey.toLowerCase().includes(lower),
    );
    if (matching.length > 0) {
      filteredCategories.set(catKey, matching);
    }
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
            <HelpCircle className="w-5 h-5 text-emerald-400" />
          </div>
          <h1 className="text-2xl font-bold text-white">
            {t("dashboard.help.title", "Help Center")}
          </h1>
        </div>
        <p className="text-slate-400 text-sm ml-13">
          {t(
            "dashboard.help.subtitle",
            "Guides, tips, and answers to common questions.",
          )}
        </p>
      </div>

      {/* Search */}
      <div className="relative mb-8">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder={t(
            "dashboard.help.searchPlaceholder",
            "Search help articles...",
          )}
          className="w-full bg-[#0d1117] border border-slate-800 rounded-xl pl-11 pr-4 py-3 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/30 transition-colors"
        />
      </div>

      {isLoading ? (
        <div className="text-center text-slate-500 py-12">Loading...</div>
      ) : filteredCategories.size === 0 ? (
        <div className="text-center py-12">
          <BookOpen className="w-10 h-10 text-slate-700 mx-auto mb-3" />
          <p className="text-slate-500 text-sm">
            {searchTerm
              ? "No results found."
              : "No help content available yet."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {Array.from(filteredCategories.entries()).map(
            ([categoryKey, catItems]) => {
              const isExpanded = expandedCategory === categoryKey;
              const groupedItems = groupBy(catItems, "itemKey");

              return (
                <div
                  key={categoryKey}
                  className="bg-[#0d1117] border border-slate-800/60 rounded-xl overflow-hidden"
                >
                  <button
                    onClick={() =>
                      setExpandedCategory(isExpanded ? null : categoryKey)
                    }
                    className="w-full flex items-center gap-3 px-5 py-4 hover:bg-slate-800/30 transition-colors text-left"
                  >
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-slate-500 shrink-0" />
                    )}
                    <span className="text-sm font-semibold text-white capitalize">
                      {categoryKey.replace(/-/g, " ")}
                    </span>
                    <span className="text-[10px] text-slate-600 bg-slate-800 px-2 py-0.5 rounded-full">
                      {groupedItems.size}
                    </span>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-slate-800/40">
                      {Array.from(groupedItems.entries()).map(
                        ([itemKey, localeItems]) => {
                          const item = localeItems[0]; // already locale-filtered
                          const isItemExpanded = expandedItem === itemKey;
                          return (
                            <div
                              key={itemKey}
                              className="border-b border-slate-800/20 last:border-b-0"
                            >
                              <button
                                onClick={() =>
                                  setExpandedItem(
                                    isItemExpanded ? null : itemKey,
                                  )
                                }
                                className="w-full flex items-center gap-2 px-5 py-3 pl-12 hover:bg-slate-800/20 transition-colors text-left"
                              >
                                <span className="text-[11px] font-medium text-slate-300 flex-1">
                                  {item.title}
                                </span>
                                <ChevronDown
                                  className={`w-3.5 h-3.5 text-slate-500 transition-transform duration-200 ${
                                    isItemExpanded ? "rotate-180" : ""
                                  }`}
                                />
                              </button>
                              {isItemExpanded && (
                                <div className="px-5 pb-4 pl-14">
                                  <p className="text-[12px] text-slate-400 leading-relaxed whitespace-pre-wrap">
                                    {item.body}
                                  </p>
                                </div>
                              )}
                            </div>
                          );
                        },
                      )}
                    </div>
                  )}
                </div>
              );
            },
          )}
        </div>
      )}

      {/* Footer link */}
      <div className="mt-8 p-4 bg-[#0d1117] border border-slate-800/60 rounded-xl flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ExternalLink className="w-4 h-4 text-slate-500" />
          <span className="text-xs text-slate-400">
            {t(
              "dashboard.help.contactSupport",
              "Still need help? Contact support.",
            )}
          </span>
        </div>
        <a
          href="mailto:support@qrmenu.com"
          className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition-colors"
        >
          support@qrmenu.com
        </a>
      </div>
    </div>
  );
};

export default HelpView;
```

- [ ] **Step 2: Verify frontend compiles**

```bash
cd apps/frontend && npx tsc --noEmit --pretty
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/pages/Dashboard/HelpView.tsx
git commit -m "feat: migrate HelpView dashboard help from i18n to API-driven content"
```

---

## Self-Review

### 1. Spec Coverage

| Spec Requirement                  | Task                                |
| --------------------------------- | ----------------------------------- |
| Prisma HelpContent model          | Task 1                              |
| Migration + @@unique constraint   | Task 1                              |
| Public GET /help-content/:section | Task 4                              |
| Super-admin CRUD endpoints        | Task 4                              |
| CreateHelpContentDto              | Task 2                              |
| UpdateHelpContentDto              | Task 2                              |
| ReorderHelpContentDto             | Task 2                              |
| HelpContentService CRUD           | Task 3                              |
| HelpContentModule registration    | Task 5                              |
| Seed from current i18n values     | Task 6                              |
| Frontend API functions            | Task 7                              |
| HelpCenterPage.tsx CMS UI         | Task 8                              |
| SuperAdminLayout nav item         | Task 9                              |
| App.tsx route                     | Task 9                              |
| LandingFAQ.tsx API migration      | Task 10                             |
| HelpView.tsx API migration        | Task 11                             |
| Trilingual editing (EN/BG/RO)     | Task 8 (LocaleTabs in EditDialog)   |
| 5-minute staleTime cache          | Task 10, 11                         |
| Empty array graceful handling     | Task 10, 11 (conditional rendering) |

### 2. Placeholder Scan

No TBD, TODO, or vague instructions found. All steps contain complete code.

### 3. Type Consistency

- `HelpContentItem` interface defined in Task 7, used in Tasks 8, 10, 11 — consistent.
- `getHelpContent()`, `getAdminHelpContent()`, `createHelpContent()`, `updateHelpContent()`, `deleteHelpContent()` — all used consistently across Tasks 8, 10, 11.
- DTO class names match between Tasks 2, 3, and 4.
- Service method names match between Tasks 3 and 4.

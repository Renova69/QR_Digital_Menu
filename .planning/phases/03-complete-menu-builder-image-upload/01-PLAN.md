---
phase: 3
plan: 1
title: "Serve Static Assets & Fix Image Paths"
wave: 1
depends_on: []
files_modified:
  - backend/src/main.ts
  - backend/src/menu/item.controller.ts
  - frontend/src/components/menu/ItemWithOptions.tsx
requirements: [REQ-003, REQ-004]
autonomous: true
must_haves:
  - backend/uploads directory is created and accessible
  - main.ts serves static files from /uploads
  - item.controller.ts stores normalized URL paths instead of OS-dependent file paths
  - ItemWithOptions properly resolves image URLs using environment variables
---

<objective>
Configure the NestJS backend to serve uploaded images as static assets, fix the image path storage format so it works across OS environments, and update the frontend to resolve image URLs properly.
</objective>

## Tasks

<task id="1.1">
<title>Ensure uploads directory exists</title>
<action>
Execute a terminal command to ensure the uploads directory exists so Multer doesn't throw errors:
```bash
mkdir -p backend/uploads
```
Add a `.gitkeep` if desired, though we are focusing on execution.
</action>
<acceptance_criteria>
- `backend/uploads` directory exists.
</acceptance_criteria>
</task>

<task id="1.2">
<title>Serve static assets in NestJS main.ts</title>
<read_first>
- backend/src/main.ts
</read_first>
<action>
Modify `backend/src/main.ts` to use `NestExpressApplication` and serve the `uploads` directory statically.

Add imports:

```typescript
import { NestExpressApplication } from "@nestjs/platform-express";
import { join } from "path";
```

Update `NestFactory.create` to pass the express application generic:

```typescript
const app = await NestFactory.create<NestExpressApplication>(AppModule);
```

Before `app.setGlobalPrefix('api');`, add the static assets configuration:

```typescript
app.useStaticAssets(join(__dirname, "..", "..", "uploads"), {
  prefix: "/uploads/",
});
```

_(Note: `__dirname` inside `dist/src` is `dist/src`, so `..`, `..` goes to the root `backend` folder where `uploads` resides)._
</action>
<acceptance_criteria>

- `main.ts` imports `NestExpressApplication` and `join`
- `main.ts` creates the app with `<NestExpressApplication>`
- `main.ts` calls `app.useStaticAssets` on the `uploads` directory
  </acceptance_criteria>
  </task>

<task id="1.3">
<title>Fix image path storage in item.controller.ts</title>
<read_first>
- backend/src/menu/item.controller.ts
</read_first>
<action>
In `backend/src/menu/item.controller.ts`, inside the `uploadImage` method, Multer gives `file.path` which on Windows could be `uploads\file.png`. We need a normalized URL path.

Update the `uploadImage` method:

```typescript
    @Post(':id/image')
    @UseInterceptors(FileInterceptor('file', {
        storage: diskStorage({
            destination: './uploads',
            filename: (req, file, cb) => {
                const randomName = Array(32).fill(null).map(() => (Math.round(Math.random() * 16)).toString(16)).join('');
                return cb(null, `${randomName}${extname(file.originalname)}`);
            }
        })
    }))
    uploadImage(@Param('id') id: string, @UploadedFile() file: Express.Multer.File, @Request() req) {
        // Store the normalized path
        const imageUrl = `uploads/${file.filename}`;
        return this.menuService.updateItemImage(id, imageUrl, req.user.id);
    }
```

</action>
<acceptance_criteria>
- `item.controller.ts` stores `uploads/${file.filename}` instead of `file.path`.
</acceptance_criteria>
</task>

<task id="1.4">
<title>Fix image rendering in ItemWithOptions.tsx</title>
<read_first>
- frontend/src/components/menu/ItemWithOptions.tsx
</read_first>
<action>
Update the `src` attribute for the item image in `frontend/src/components/menu/ItemWithOptions.tsx`.
Currently it uses `http://localhost:3000/`. Let's dynamically construct it using `VITE_API_URL` without the `/api` part, or fallback to localhost.

```tsx
const getImageUrl = (url: string) => {
  const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:3000/api";
  const baseUrl = apiUrl.replace("/api", "");
  return `${baseUrl}/${url}`;
};

// ... inside render:
{
  item.imageUrl && (
    <img
      src={getImageUrl(item.imageUrl)}
      alt={item.name}
      className="w-full h-32 object-cover mb-4 rounded-md"
    />
  );
}
```

</action>
<acceptance_criteria>
- `ItemWithOptions.tsx` dynamically constructs the full image URL.
- No hardcoded `http://localhost:3000/` string remains.
</acceptance_criteria>
</task>

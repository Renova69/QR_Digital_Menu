# Code Conventions

## Backend Conventions (NestJS / TypeScript)

### Module Pattern

Every domain feature follows the standard NestJS module triad:
```
{domain}/
  ├── {domain}.module.ts       # Module with imports/providers/controllers
  ├── {domain}.controller.ts   # HTTP endpoint definitions
  ├── {domain}.service.ts      # Business logic
  ├── dto/                     # Data Transfer Objects
  └── entities/                # Entity definitions
```

### Controller Pattern

```typescript
// Typical controller structure in backend/src/restaurants/restaurants.controller.ts
@Controller('restaurants')
export class RestaurantsController {
  constructor(private readonly restaurantsService: RestaurantsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @UsePipes(new ValidationPipe({ whitelist: true }))
  create(@Body() dto: CreateRestaurantDto, @AuthUser() user) {
    return this.restaurantsService.create(dto, user.id);
  }
}
```

- All protected endpoints use `@UseGuards(JwtAuthGuard)`
- DTO validation via `@UsePipes(new ValidationPipe({ whitelist: true }))`
- User extracted via `@AuthUser()` custom decorator or `@Request() req`

### Service Pattern

```typescript
// Services inject PrismaService and perform DB operations
@Injectable()
export class RestaurantsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateRestaurantDto, userId: string) {
    return this.prisma.restaurant.create({
      data: { ...dto, ownerId: userId },
    });
  }
}
```

### Authorization Pattern

Ownership checks are done in service methods before mutations:

```typescript
// backend/src/menu/menu.service.ts
private async checkRestaurantOwnership(restaurantId: string, userId: string) {
  const restaurant = await this.prisma.restaurant.findUnique({
    where: { id: restaurantId },
  });
  if (!restaurant) throw new NotFoundException(...);
  if (restaurant.ownerId !== userId) throw new ForbiddenException(...);
}
```

### Error Handling

- NestJS built-in HTTP exceptions are used directly (`NotFoundException`, `ForbiddenException`, `ConflictException`)
- No custom exception filters currently implemented
- Auth errors return 401 via Passport guards

### DTO Pattern

DTOs use `class-validator` decorators:
```typescript
// Typical DTO pattern
export class CreateAuthDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;
}
```

Update DTOs extend Create DTOs using `@nestjs/mapped-types`:
```typescript
export class UpdateRestaurantDto extends PartialType(CreateRestaurantDto) {}
```

## Frontend Conventions (React / TypeScript)

### Context Pattern

All contexts follow the same structure:

```typescript
// 1. Interface for context value
interface CartContextType {
  items: CartItem[];
  addItem: (item: CartItem) => void;
  // ...
}

// 2. Create context with undefined default
const CartContext = createContext<CartContextType | undefined>(undefined);

// 3. Provider component with useState
export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  // ... methods
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

// 4. Custom hook with safety check
export function useCart() {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
}
```

### TanStack Query Hook Pattern

```typescript
// Custom hooks wrap useQuery/useMutation
export const useAuth = () => {
  const queryClient = useQueryClient();

  const { data: user, isLoading } = useQuery({
    queryKey: ['user'],
    queryFn: fetchUser,
  });

  const loginMutation = useMutation({
    mutationFn: async (credentials) => { /* ... */ },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['user'] }),
  });

  return { user, isLoading, login: loginMutation.mutateAsync };
};
```

### UI Component Pattern (shadcn/ui-style)

Components built with CVA (Class Variance Authority) + Tailwind:

```typescript
// frontend/src/components/ui/button.tsx
const buttonVariants = cva(
  "inline-flex items-center justify-center ...",
  {
    variants: {
      variant: { default: "...", destructive: "...", outline: "..." },
      size: { default: "...", sm: "...", lg: "..." },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
  )
);
```

### Route Protection

```typescript
// frontend/src/components/ProtectedRoute.tsx
// Wraps children, redirects to /login if not authenticated
<ProtectedRoute>
  <DashboardPage />
</ProtectedRoute>
```

### API Service Pattern

Two layers of API abstraction:
1. **`lib/api.ts`** — Axios instance + standalone API functions
2. **`services/*.ts`** — Module-specific API wrappers (used by some components)

Token management:
```typescript
// Set after login
api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
// Clear on logout
delete api.defaults.headers.common['Authorization'];
```

### Styling Conventions

- **Design tokens:** HSL CSS variables in `frontend/src/index.css` (shadcn/ui pattern)
- **Utility classes:** Tailwind CSS with custom theme tokens
- **Class merging:** `cn()` utility combining `clsx` + `tailwind-merge` (`frontend/src/lib/utils.ts`)
- **Animations:** `tailwindcss-animate` plugin
- **Dark mode:** CSS variable-based (class toggle), light/dark themes defined

### TypeScript Usage

- **Backend:** Relaxed — `strictNullChecks: false`, `noImplicitAny: false`, `@typescript-eslint/no-explicit-any: off`
- **Frontend:** Moderately typed — interfaces for Order, Item, Category in `types/index.ts`; some `any` usage in contexts (e.g., `selectedOptions: any[]`)

## Code Formatting

### Backend
- **Prettier:** Single quotes, trailing commas
- **ESLint:** TypeScript ESLint recommended with type checking
- **Indentation:** 2 spaces (Prettier default)

### Frontend
- **No explicit Prettier/ESLint config** — relies on Vite defaults and editor settings
- **Indentation:** 2 spaces

## Git Conventions

- Root `.gitignore`: Standard Node/IDE patterns
- Backend `.gitignore`: `node_modules`, build artifacts
- No commit message conventions enforced
- No pre-commit hooks configured

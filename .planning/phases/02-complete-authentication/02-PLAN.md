---
phase: 2
plan: 2
title: "Add Error Boundary & Auth Error Feedback"
wave: 1
depends_on: []
files_modified:
  - frontend/src/components/ErrorBoundary.tsx
  - frontend/src/App.tsx
  - frontend/src/components/ui/LoginDialog.tsx
  - frontend/src/context/AuthContext.tsx
requirements: [REQ-001]
autonomous: true
must_haves:
  - React Error Boundary wraps the entire app
  - Error Boundary shows fallback UI with retry button
  - LoginDialog shows error messages from failed login/register
  - AuthContext exposes error message string
---

<objective>
Add a React Error Boundary component to catch render errors gracefully, and add user-visible error feedback (toast/inline messages) to the LoginDialog when authentication fails.
</objective>

## Tasks

<task id="2.1">
<title>Create React Error Boundary component</title>
<read_first>
- frontend/src/App.tsx
</read_first>
<action>
Create `frontend/src/components/ErrorBoundary.tsx`:

```typescript
import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen p-4">
          <div className="max-w-md text-center">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Something went wrong</h1>
            <p className="text-gray-600 mb-4">
              An unexpected error occurred. Please try again.
            </p>
            {this.state.error && (
              <p className="text-sm text-red-600 bg-red-50 p-3 rounded mb-4 font-mono">
                {this.state.error.message}
              </p>
            )}
            <button
              onClick={this.handleRetry}
              className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors"
            >
              Try Again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
```

Wrap the app in `frontend/src/App.tsx`:
- Import `ErrorBoundary` at the top
- Wrap `<Router>` with `<ErrorBoundary>`:

```tsx
<ErrorBoundary>
  <Router>
    ...
  </Router>
</ErrorBoundary>
```
</action>
<acceptance_criteria>
- File `frontend/src/components/ErrorBoundary.tsx` exists
- `ErrorBoundary.tsx` is a class component with `getDerivedStateFromError`
- `ErrorBoundary.tsx` renders a "Try Again" button
- `frontend/src/App.tsx` imports `ErrorBoundary`
- `frontend/src/App.tsx` wraps `<Router>` with `<ErrorBoundary>`
</acceptance_criteria>
</task>

<task id="2.2">
<title>Add auth error feedback to LoginDialog</title>
<read_first>
- frontend/src/components/ui/LoginDialog.tsx
- frontend/src/context/AuthContext.tsx
</read_first>
<action>
Update AuthContext to track an error message string. In `frontend/src/context/AuthContext.tsx`:

Add to `AuthContextType` interface:
```typescript
errorMessage: string | null;
```

Add state:
```typescript
const [errorMessage, setErrorMessage] = useState<string | null>(null);
```

In the `login` catch block, extract the error message:
```typescript
} catch (error: any) {
  setIsError(true);
  const msg = error.response?.data?.message || 'Login failed. Please check your credentials.';
  setErrorMessage(msg);
  throw error;
}
```

Same pattern for `register`:
```typescript
} catch (error: any) {
  setIsError(true);
  const msg = error.response?.data?.message || 'Registration failed. Please try again.';
  setErrorMessage(msg);
  throw error;
}
```

In the `try` blocks, clear errorMessage: `setErrorMessage(null);`

Add `errorMessage` to the value object.

Update `LoginDialog.tsx` to show error messages:

Add `errorMessage` to the useAuth destructuring:
```typescript
const { login, register, isLoading, errorMessage } = useAuth();
```

Add error display before the form:
```tsx
{errorMessage && (
  <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md">
    <p className="text-sm text-red-600">{errorMessage}</p>
  </div>
)}
```

Wrap `handleSubmit` in try/catch to suppress the re-throw:
```typescript
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  try {
    if (isLogin) {
      await login(email, password);
    } else {
      await register(email, password);
    }
  } catch {
    // Error already handled by AuthContext
  }
};
```
</action>
<acceptance_criteria>
- `frontend/src/context/AuthContext.tsx` contains `errorMessage` in AuthContextType
- `frontend/src/context/AuthContext.tsx` sets `errorMessage` in catch blocks with descriptive text
- `frontend/src/components/ui/LoginDialog.tsx` destructures `errorMessage` from useAuth
- `frontend/src/components/ui/LoginDialog.tsx` contains `bg-red-50` error display div
- `frontend/src/components/ui/LoginDialog.tsx` handleSubmit wraps calls in try/catch
</acceptance_criteria>
</task>

## Verification
```bash
# Error Boundary exists and wraps app
test -f frontend/src/components/ErrorBoundary.tsx
grep "ErrorBoundary" frontend/src/App.tsx

# Auth errors shown in LoginDialog
grep "errorMessage" frontend/src/components/ui/LoginDialog.tsx
grep "errorMessage" frontend/src/context/AuthContext.tsx
```

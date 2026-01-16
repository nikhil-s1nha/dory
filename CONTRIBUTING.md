# Contributing to Candle

Thank you for your interest in contributing to Candle! This document provides guidelines and instructions for contributing.

## Code Style Guidelines

### TypeScript

- Use TypeScript for all new files
- Prefer interfaces over types for object shapes
- Use explicit return types for functions
- Avoid `any` type - use `unknown` if necessary

### React Native

- Use functional components with hooks
- Extract reusable logic into custom hooks
- Keep components small and focused
- Use StyleSheet.create() for styles

### File Naming

- Components: PascalCase (e.g., `Button.tsx`)
- Utilities: camelCase (e.g., `formatDate.ts`)
- Constants: UPPER_SNAKE_CASE (e.g., `API_ENDPOINTS`)

### Import Organization

1. React and React Native imports
2. Third-party library imports
3. Internal imports (using path aliases)
4. Type imports (using `import type`)

Example:
```typescript
import React from 'react';
import {View, Text} from 'react-native';
import {useNavigation} from '@react-navigation/native';

import {Button} from '@components';
import {useAuthStore} from '@store';
import {theme} from '@theme';

import type {User} from '@utils/types';
```

## Commit Message Conventions

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

- **feat:** A new feature
- **fix:** A bug fix
- **docs:** Documentation only changes
- **style:** Code style changes (formatting, semicolons, etc.)
- **refactor:** Code refactoring
- **test:** Adding or updating tests
- **chore:** Maintenance tasks

Examples:
```
feat: add user authentication screen
fix: resolve navigation state persistence issue
docs: update README with installation instructions
refactor: extract theme colors into constants
```

## Pull Request Process

1. **Create a branch** from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes** following the code style guidelines

3. **Test your changes**:
   - Run the app on iOS and Android
   - Ensure linting passes: `npm run lint`
   - Format code: `npm run format`

4. **Commit your changes** using conventional commit messages

5. **Push to your branch**:
   ```bash
   git push origin feature/your-feature-name
   ```

6. **Create a Pull Request**:
   - Provide a clear description of changes
   - Reference any related issues
   - Include screenshots for UI changes
   - Ensure all CI checks pass

7. **Address review feedback** promptly

## Development Workflow

### Before Starting

1. Ensure you're on the latest `main` branch
2. Create a new branch for your feature/fix
3. Install dependencies: `npm install`

### During Development

1. Keep your branch updated with `main`
2. Write clear, descriptive commit messages
3. Test on both iOS and Android platforms
4. Follow the existing code patterns and architecture

### Testing Checklist

- [ ] Code runs on iOS 15.1+
- [ ] Code runs on Android API 24+
- [ ] No linting errors (`npm run lint`)
- [ ] Code is properly formatted (`npm run format`)
- [ ] No TypeScript errors
- [ ] Navigation flows work correctly
- [ ] State management works as expected

## Project-Specific Guidelines

### Theme Usage

Always use the theme system for colors, typography, and spacing:

```typescript
import {theme} from '@theme';

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.background,
    padding: theme.spacing.base,
  },
  text: {
    ...theme.typography.styles.body,
    color: theme.colors.text,
  },
});
```

### State Management

Use Zustand stores for global state:

```typescript
import {useAuthStore} from '@store';

const MyComponent = () => {
  const user = useAuthStore(state => state.user);
  const setUser = useAuthStore(state => state.setUser);
  // ...
};
```

### Navigation

Use typed navigation from `@utils/types`:

```typescript
import {useNavigation} from '@react-navigation/native';
import type {MainTabParamList} from '@utils/types';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';

type NavigationProp = NativeStackNavigationProp<MainTabParamList>;
```

## Questions?

If you have questions or need clarification, please:
- Open an issue for discussion
- Reach out to the maintainers
- Check existing documentation

Thank you for contributing to Candle! 🕯️

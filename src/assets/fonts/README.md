# Font Assets

This directory should contain font files (TTF, OTF) for the app.

## Placeholder Font

A `placeholder.ttf` file should be added here. Since TTF files are complex binary formats, you should:

1. Obtain a font file from a font provider (Google Fonts, Adobe Fonts, etc.)
2. Rename it to `placeholder.ttf` or use the actual font name
3. Update `src/assets/index.ts` to export it properly

## Example Usage

```typescript
// In src/assets/index.ts
export { default as placeholderFont } from './fonts/placeholder.ttf';

// In your component
import { placeholderFont } from '@/assets';
// Use with react-native-paper or react-native-vector-icons
```

# Runtime Locale Extension

This directory allows you to extend or override translations at runtime without rebuilding the application.

## How it works

1. Place locale files in this directory following the pattern: `{locale}.json` (e.g., `en.json`, `de.json`, `fr.json`, `es.json`)
2. The application will automatically load and merge these files with built-in translations
3. Runtime translations take precedence over built-in translations, allowing you to override specific keys

## File Structure

Each locale file should follow the same nested structure as the built-in locale files:

```json
{
  "common": {
    "home": "Custom Home Text"
  },
  "custom": {
    "myKey": "My Custom Translation"
  }
}
```

## Examples

### Override an existing translation

Create `public/i18n/en.json`:

```json
{
  "nav": {
    "home": "Homepage"
  }
}
```

This will change the "Home" text to "Homepage" in English.

### Add new custom translations

Create `public/i18n/en.json`:

```json
{
  "custom": {
    "welcomeMessage": "Welcome to our portal!",
    "helpText": "Need assistance? Contact us."
  }
}
```

You can then use these in your components with `{{ $t('custom.welcomeMessage') }}`.

### Extend multiple locales

Create separate files for each locale you want to extend:

- `public/i18n/en.json` - English extensions
- `public/i18n/de.json` - German extensions
- `public/i18n/fr.json` - French extensions
- `public/i18n/es.json` - Spanish extensions

### Custom Locales

To use a custom locale code such as `ymen`, add a translation file at `public/i18n/ymen.json`.
Then update `configuration.json` so the app knows that `ymen` is an allowed locale and the default locale:

```json
{
  "ui": {
    "i18n": {
      "availableLocales": ["ymen"],
      "defaultLocale": "ymen"
    }
  }
}
```

If you only want to show one language in the UI, set `availableLocales` to just that locale code.
The language switcher only renders the locales listed in `availableLocales`.

If you want runtime overrides only, keep the file in `public/i18n/ymen.json`.
If you want the locale to exist in the built-in bundle as well, add `src/i18n/locales/ymen.json` too.

## Important Notes

- Runtime locale files are optional - the app works fine without them
- If a runtime locale file doesn't exist or fails to load, the built-in translations will be used
- Deep merging is supported, so you only need to specify the keys you want to override/add
- Changes to runtime locale files require a browser refresh to take effect
- Runtime locale files are loaded asynchronously during app initialization

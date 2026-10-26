# Accessibility

## Commitment

Every figure in this repository is accompanied by a full text description in its `alt` attribute, and every number in a figure also appears in a table or in the prose, so nothing is conveyed by an image alone. Light and dark variants of each figure exist so that text in the figures remains legible against the GitHub theme the reader has chosen. Footnotes are plain links that work with screen readers.

## Supported environments

The README is written in GitHub Flavored Markdown and is tested in GitHub's rendering on desktop and mobile, in light and dark mode, and with screen readers that honor `alt` text and table semantics.

## Known limitations

The SVG figures use GitHub's `#gh-light-mode-only` and `#gh-dark-mode-only` suffixes, which some Markdown renderers outside GitHub do not support; in those renderers both variants may appear. Text inside the SVGs is not resizable by browser text-size settings, though the same content is available in the surrounding tables and prose. Color is not used as the sole carrier of meaning, but contrast in the dark variants has not been verified by an independent audit.

## Reporting barriers

If anything here is hard to read or use, open an issue with the "Accessibility barrier" template. Describe what you were trying to do, the assistive technology or environment you were using, and what happened.

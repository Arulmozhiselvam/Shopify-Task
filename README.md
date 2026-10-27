# Khrisha product pages: Shopify assignment

Two product pages recreated in a Shopify theme built on **Dawn**, driven by product metafields:

| Page | Template | Reference |
|---|---|---|
| Kajal Lamar EDP 100ml | `templates/product.fragrance.json` | https://khrisha.rankmybusiness.com.au/products/kajal-lamar-edp-100ml |
| Custom Discovery Set (custom functionality) | `templates/product.discovery-set.json` | https://khrisha.rankmybusiness.com.au/products/discovery-set |

## Live preview

| | |
|---|---|
| Store | https://djz1ju-ae.myshopify.com (password: `bowfle`) |
| Fragrance page | https://djz1ju-ae.myshopify.com/products/lamar |
| Discovery Set page | https://djz1ju-ae.myshopify.com/products/custom-discovery-set |
| Theme | `Shopify-Task/shopify-theme`, connected to the `shopify-theme` branch of this repo through Shopify's GitHub integration |

**Quick test:** on Lamar, switch between *100ml* and *Sample 3ml* (price, URL and button update), change the quantity, then add to bag (the cart drawer opens). On the Discovery Set, try adding before choosing (it's blocked with a hint), type in a picker to get suggestions, enter the same fragrance twice (duplicate warning), complete all six and add. The cart line shows `Fragrance 1…6`. Then switch to *Curate for me*, pick styles, add notes and add again.

## Screenshots

| | Desktop | Mobile |
|---|---|---|
| Fragrance | [full page](screenshots/lamar-desktop-full.png) · [first screen](screenshots/lamar-desktop-hero.png) | [full page](screenshots/lamar-mobile-full.png) · [first screen](screenshots/lamar-mobile-hero.png) |
| Discovery Set | [full page](screenshots/discovery-set-desktop-full.png) · [first screen](screenshots/discovery-set-desktop-hero.png) | [full page](screenshots/discovery-set-mobile-full.png) · [first screen](screenshots/discovery-set-mobile-hero.png) |

## Repository layout

```
khrisha-theme/     Dawn + custom kh-* sections, snippets and assets
store-setup/       Script that creates metafield definitions, metaobjects, products and collections
store-assets/      Reference images, for manual upload if you don't use the script
screenshots/       Desktop and mobile screenshots of both pages
```

Branches: `main` holds everything above. `shopify-theme` holds only the theme at its root, because Shopify's GitHub integration needs that layout.

## What was built

**Fragrance page (`product.fragrance`)**
- `kh-main-product`: breadcrumb; image gallery with arrows, thumbnails, counter, swipe and keyboard support; variant cards (100ml / Sample 3ml) that update price, URL, gallery image and stock state; quantity selector; AJAX add to cart that opens Dawn's cart drawer; Shop Pay / dynamic checkout; 4-payment instalment line; trust strip.
- `kh-scent-profile`: top/heart/base note pyramid (metaobjects with images) and main accord bars.
- `kh-how-it-wears`: opening → heart → drydown timeline, longevity bar, projection steps, occasions and seasons.
- `kh-story`: quote, intro and an expandable rich-text story.
- `kh-try-before`, `kh-reviews-cta`, `kh-faq` (blocks), `kh-house-band` (+ trust row).
- `kh-related-products`: hand-picked products from a metafield, falling back to Shopify recommendations. Cards have an image carousel and quick add.

**Discovery Set page (`product.discovery-set`), custom functionality**
- **"I'll choose my six"**: six searchable comboboxes (keyboard accessible, ARIA combobox/listbox). Suggestions come from a collection set in a metafield, falling back to Shopify predictive search. It shows progress (`3 / 6`), clear buttons and duplicate detection.
- **"Curate for me"**: scent-style chips (Fresh, Floral, Fruity, Woody, Amber, Sweet) plus a free-text "What do you love?" box.
- Validation: the set can't be added until it's complete, and a hint says what's missing.
- The choices are sent as **line item properties** (`Fragrance 1` … `Fragrance 6`, or `Preferred styles` / `What I love`), so they show in the cart, checkout and the order in admin.
- "Copy preferences" button, quantity selector, AJAX add to cart, plus the "how it works" steps, FAQ and help band.

**Header:** Dawn's header gets an optional "Khrisha style" (on by default): a search pill, a centred logo, a "Bag (n)" cart link and an uppercase menu, as on the reference.

All new CSS lives in `assets/khrisha.css` and `assets/khrisha-header.css`, scoped under `.kh` / `.header--kh`, so the rest of Dawn is untouched. The JS is two small vanilla files (`khrisha-product.js`, `khrisha-discovery.js`) built from custom elements, with no dependencies. Every section is editable in the theme editor.

## Metafields

All definitions use the `custom` namespace on **Products** unless noted. Create them in
**Settings → Custom data**, or run the setup script below.

### Metaobject: `scent_note`
| Field | Type | |
|---|---|---|
| `name` | Single line text | e.g. Bulgarian Rose |
| `image` | File (image) | Round thumbnail in the note pyramid |

### Metaobject: `faq`
| Field | Type | |
|---|---|---|
| `question` | Single line text | |
| `answer` | Rich text | |

### Metaobject: `discovery_step`
| Field | Type | |
|---|---|---|
| `title` | Single line text | "Choose your collection" |
| `text` | Multi-line text | |
| `icon` | Single line text (choices) | flask / heart / sparkles / gift |

Storefront access must be **on** for all three metaobjects (the script sets this) so Liquid can read them. Entries are reusable across products.

### Fragrance page
| Key | Type | Used for |
|---|---|---|
| `display_name` | Single line text | H1 and card title ("Lamar"); falls back to product title |
| `badge` | Single line text | Image badge ("Bestseller" gets the dark style) |
| `tagline` | Single line text | Italic hook under the title + story quote |
| `scent_families` | List: single line text | Coloured family chips (Fresh/Floral/Fruity/Woody/Amber/Sweet) |
| `top_notes` / `heart_notes` / `base_notes` | List: metaobject (`scent_note`) | Note pyramid + note lines in "How it wears" |
| `main_accords` | List: single line text | Accord bars. Format `Name \| strength`, e.g. `Fruity \| 100`; strength is optional |
| `wear_opening` / `wear_heart` / `wear_drydown` | Single line text | The three wear phases |
| `longevity` | Single line text | "8–10 hours" |
| `longevity_hours` | Integer | Fills the longevity bar (out of 12) |
| `projection` | Single line text (choices) | Soft / Moderate / Strong / Heavy / Enormous → 1–4 steps |
| `occasions` / `seasons` | List: single line text | "Best for" pills |
| `story_intro` | Multi-line text | Story opening paragraph |
| `story_full` | Rich text | Behind "Read the full story" |
| `story_url` | URL | Optional external story link |
| `related_products` | List: product | "Others also considered" (empty = auto recommendations). Also reads `custom.custom_related_product`, a list of `custom_product` metaobjects whose `name` field holds products |
| `house_collection` | Collection | "More from Kajal" link (empty = vendor page) |
| `sample_product` | Product | Optional; otherwise the variant named "Sample…" is used |
| `key_notes` / `size_label` | List text / text | Used when this product appears on a card |
| `faqs` | List: metaobject (`faq`) | "Your questions, answered" (empty = section blocks) |
| `delivery_note` | Single line text | Overrides "Ships from South Yarra next business day" |
| `reviews_url` | URL | "Read product reviews" link |
| `discovery_product` | Product | "The discovery edit" card link |
| `reviews.rating` / `reviews.rating_count` | Shopify standard | Star rating in the reviews band, filled by any reviews app |

**Variant metafield** `custom.caption` (Single line text): the small line on each size card ("Full bottle", "Try it first").

### Discovery Set page
| Key | Type | Used for |
|---|---|---|
| `set_size` | Integer (1–12) | Number of pickers (default 6), also shown in "6 × 3ml" |
| `sample_size` | Single line text | "3ml" |
| `tagline` | Single line text | Intro line under the title |
| `discovery_collection` | Collection | Fragrances suggested in the pickers |
| `gallery_eyebrow` / `gallery_caption` | Single line text | Caption under the gallery |
| `steps` | List: metaobject (`discovery_step`) | "Six scents. Endless possibilities." steps (empty = section blocks) |
| `steps_image` | File (image) | Image beside the steps (empty = product's 3rd image) |
| `faqs` | List: metaobject (`faq`) | "A little more about your set" |
| `consultation_url` | URL | "Book a consultation" button |
| `delivery_note` | Single line text | Delivery line override |

**How content is resolved:** for every product-specific value, the section reads the **metafield first**. When the metafield is empty, it uses the section's **theme-editor setting**, which is pre-filled with the reference Lamar / Discovery Set content. So the page is complete out of the box, and each new product only needs its own metafields to get its own content, with no code changes. Store-wide labels (section headings, "Top / Heart / Base", trust strip) are section settings only, because they're the same on every product.

## How to configure a product

1. Assign the template: **Products → (product) → Theme template → `fragrance`** or **`discovery-set`**.
2. Fill in the metafields at the bottom of the product page in admin.
3. For notes, FAQs and discovery steps, go to **Content → Metaobjects**, add entries to *Scent note*, *FAQ* or *Discovery step*, then pick them in the product's metafields.
4. Variant captions: open each variant and fill in **Caption**.

## Setup

### 1. Push the theme (unpublished)
```bash
npm install -g @shopify/cli@3.84.0     # 3.84 runs on Node 20.10+; latest needs Node 22
cd khrisha-theme
shopify theme push --store YOUR-STORE.myshopify.com --unpublished --theme "Khrisha assignment"
```
For live reload while developing: `shopify theme dev --store YOUR-STORE.myshopify.com`.

### 2. Create the data (optional script)
The script needs an Admin API token with `write_products, write_metaobject_definitions, write_metaobjects, write_files, write_publications`. Create an app in the Shopify **Dev Dashboard**, install it on the store, then:
```bash
cd store-setup
SHOPIFY_STORE=YOUR-STORE.myshopify.com SHOPIFY_CLIENT_ID=... SHOPIFY_CLIENT_SECRET=... node setup-store.mjs
# or: SHOPIFY_ADMIN_TOKEN=shpat_... node setup-store.mjs
```
It creates the 3 metaobject definitions, 36 product metafield definitions + 1 variant definition, 9 scent notes, 9 FAQs, 3 discovery steps, both products (with template suffix and metafields filled), 4 related fragrances, and the Kajal / Fragrances / Samples collections. It's safe to re-run.

### 3. Preview
Online Store → Themes → *Khrisha assignment* → **Preview**, then open `/products/kajal-lamar-edp-100ml` and `/products/discovery-set`.

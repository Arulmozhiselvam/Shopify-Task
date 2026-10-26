#!/usr/bin/env node
/*
  Creates everything the Khrisha product pages need in a Shopify store:
    - `scent_note` metaobject definition + 9 note entries (with images)
    - all `custom.*` product / variant metafield definitions
    - 4 related fragrances, "Kajal Lamar" and "Custom Discovery Set" products
    - "Kajal", "Fragrances" and "Samples" collections
  Safe to re-run: definitions are skipped if they exist and products are matched by handle.

  Usage (Node 20+):
    SHOPIFY_STORE=your-store.myshopify.com SHOPIFY_ADMIN_TOKEN=shpat_xxx node setup-store.mjs
  or, for a Dev Dashboard app installed on the store:
    SHOPIFY_STORE=... SHOPIFY_CLIENT_ID=... SHOPIFY_CLIENT_SECRET=... node setup-store.mjs

  Required Admin API scopes:
    write_products, write_metaobject_definitions, write_metaobjects, write_files, write_publications
*/
import { readFileSync } from 'node:fs';

const data = JSON.parse(readFileSync(new URL('./data.json', import.meta.url), 'utf8'));

const STORE = process.env.SHOPIFY_STORE;
const API_VERSION = process.env.SHOPIFY_API_VERSION || '2026-04';
if (!STORE) fail('Set SHOPIFY_STORE, e.g. your-store.myshopify.com');

let token = process.env.SHOPIFY_ADMIN_TOKEN;

function fail(msg) {
  console.error(`\n✖ ${msg}`);
  process.exit(1);
}

async function getToken() {
  if (token) return token;
  const { SHOPIFY_CLIENT_ID: id, SHOPIFY_CLIENT_SECRET: secret } = process.env;
  if (!id || !secret) fail('Set SHOPIFY_ADMIN_TOKEN, or SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET');
  const res = await fetch(`https://${STORE}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: id, client_secret: secret }),
  });
  if (!res.ok) fail(`Token request failed (${res.status}): ${await res.text()}`);
  token = (await res.json()).access_token;
  return token;
}

async function gql(query, variables = {}) {
  const res = await fetch(`https://${STORE}/admin/api/${API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': await getToken() },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (!res.ok || json.errors) fail(`GraphQL error: ${JSON.stringify(json.errors || json)}`);
  return json.data;
}

function userErrors(payload, label, { allow = [] } = {}) {
  const errors = (payload && payload.userErrors) || [];
  const real = errors.filter((e) => !allow.includes(e.code));
  if (real.length) fail(`${label}: ${real.map((e) => `${(e.field || []).join('.')} ${e.message}`).join('; ')}`);
  return errors.length > 0;
}

const json = (v) => JSON.stringify(v);
const richText = (paragraphs) =>
  json({ type: 'root', children: paragraphs.map((p) => ({ type: 'paragraph', children: [{ type: 'text', value: p }] })) });

/* ---------- 1. Metaobject definitions ---------- */

const METAOBJECTS = {
  scent_note: {
    name: 'Scent note',
    displayNameKey: 'name',
    fieldDefinitions: [
      { key: 'name', name: 'Name', type: 'single_line_text_field', required: true },
      { key: 'image', name: 'Image', type: 'file_reference', validations: [{ name: 'file_type_options', value: '["Image"]' }] },
    ],
  },
  faq: {
    name: 'FAQ',
    displayNameKey: 'question',
    fieldDefinitions: [
      { key: 'question', name: 'Question', type: 'single_line_text_field', required: true },
      { key: 'answer', name: 'Answer', type: 'rich_text_field', required: true },
    ],
  },
  discovery_step: {
    name: 'Discovery step',
    displayNameKey: 'title',
    fieldDefinitions: [
      { key: 'title', name: 'Title', type: 'single_line_text_field', required: true },
      { key: 'text', name: 'Text', type: 'multi_line_text_field' },
      { key: 'icon', name: 'Icon', type: 'single_line_text_field', validations: [{ name: 'choices', value: '["flask","heart","sparkles","gift"]' }] },
    ],
  },
};

async function ensureMetaobjectDefinition(type) {
  const existing = await gql(`query($t: String!) { metaobjectDefinitionByType(type: $t) { id } }`, { t: type });
  if (existing.metaobjectDefinitionByType) {
    console.log(`• metaobject definition ${type} (exists)`);
    return existing.metaobjectDefinitionByType.id;
  }
  const { metaobjectDefinitionCreate: r } = await gql(
    `mutation($d: MetaobjectDefinitionCreateInput!) {
      metaobjectDefinitionCreate(definition: $d) { metaobjectDefinition { id } userErrors { field message code } }
    }`,
    { d: { type, access: { storefront: 'PUBLIC_READ' }, ...METAOBJECTS[type] } }
  );
  userErrors(r, `${type} definition`);
  console.log(`✓ metaobject definition ${type}`);
  return r.metaobjectDefinition.id;
}

// Creates or updates an entry by handle and returns its id.
async function upsertMetaobject(type, handle, fields) {
  const { metaobjectUpsert: r } = await gql(
    `mutation($h: MetaobjectHandleInput!, $m: MetaobjectUpsertInput!) {
      metaobjectUpsert(handle: $h, metaobject: $m) { metaobject { id } userErrors { field message code } }
    }`,
    { h: { type, handle }, m: { fields: Object.entries(fields).map(([key, value]) => ({ key, value })) } }
  );
  userErrors(r, `${type} ${handle}`);
  return r.metaobject.id;
}

/* ---------- 2. Metafield definitions ---------- */

async function ensureMetafieldDefinitions({ scent_note: noteDefinitionId, faq: faqDefinitionId, discovery_step: stepDefinitionId }) {
  const defs = [
    ['display_name', 'Display name', 'single_line_text_field', 'Short name shown as the H1 and on cards, e.g. "Lamar".'],
    ['badge', 'Badge', 'single_line_text_field', 'Image badge, e.g. Bestseller, New, Exclusive.'],
    ['tagline', 'Tagline', 'single_line_text_field', 'One-line hook under the title and in the story quote.'],
    ['scent_families', 'Scent families', 'list.single_line_text_field', 'Fresh, Floral, Fruity, Woody, Amber or Sweet.'],
    ['top_notes', 'Top notes', 'list.metaobject_reference', 'Scent note entries for the opening.', noteDefinitionId],
    ['heart_notes', 'Heart notes', 'list.metaobject_reference', 'Scent note entries for the heart.', noteDefinitionId],
    ['base_notes', 'Base notes', 'list.metaobject_reference', 'Scent note entries for the drydown.', noteDefinitionId],
    ['main_accords', 'Main accords', 'list.single_line_text_field', 'One per line as "Name | strength" (0-100), strongest first.'],
    ['wear_opening', 'Wear: opening', 'single_line_text_field', 'How the first spray feels.'],
    ['wear_heart', 'Wear: heart', 'single_line_text_field', 'How it develops.'],
    ['wear_drydown', 'Wear: drydown', 'single_line_text_field', 'How it settles.'],
    ['longevity', 'Longevity', 'single_line_text_field', 'Display text, e.g. "8–10 hours".'],
    ['longevity_hours', 'Longevity (hours)', 'number_integer', 'Drives the longevity bar (out of 12).'],
    ['projection', 'Projection', 'single_line_text_field', 'Soft, Moderate, Strong, Heavy or Enormous.', null, [{ name: 'choices', value: json(['Soft', 'Moderate', 'Strong', 'Heavy', 'Enormous']) }]],
    ['occasions', 'Occasions', 'list.single_line_text_field', 'e.g. Date night, Evening.'],
    ['seasons', 'Seasons', 'list.single_line_text_field', 'Spring, Summer, Autumn, Winter.'],
    ['story_intro', 'Story intro', 'multi_line_text_field', 'Opening paragraph of the story.'],
    ['story_full', 'Story (full)', 'rich_text_field', 'Shown behind "Read the full story".'],
    ['story_url', 'Story link', 'url', 'Optional "Explore the fragrance story" link.'],
    ['key_notes', 'Key notes (cards)', 'list.single_line_text_field', 'Three headline notes shown on product cards.'],
    ['size_label', 'Size label (cards)', 'single_line_text_field', 'e.g. 100ml.'],
    ['related_products', 'Related products', 'list.product_reference', '"Others also considered". Empty = automatic recommendations.'],
    ['house_collection', 'House collection', 'collection_reference', '"More from <house>" link.'],
    ['sample_product', 'Sample product', 'product_reference', 'Optional separate sample product.'],
    ['set_size', 'Set size', 'number_integer', 'Discovery set: number of fragrances to choose.', null, [{ name: 'min', value: '1' }, { name: 'max', value: '12' }]],
    ['sample_size', 'Sample size', 'single_line_text_field', 'Discovery set: vial size, e.g. 3ml.'],
    ['discovery_collection', 'Discovery fragrances', 'collection_reference', 'Discovery set: fragrances suggested in the pickers.'],
    ['faqs', 'FAQs', 'list.metaobject_reference', 'Questions for this product. Empty = the section blocks.', faqDefinitionId],
    ['delivery_note', 'Delivery note', 'single_line_text_field', 'Overrides the "Ships from…" line for this product.'],
    ['reviews_url', 'Reviews link', 'url', '"Read product reviews" link.'],
    ['discovery_product', 'Discovery set product', 'product_reference', '"The discovery edit" card link.'],
    ['steps', 'Discovery steps', 'list.metaobject_reference', 'Discovery set: "how it works" steps.', stepDefinitionId],
    ['steps_image', 'Discovery steps image', 'file_reference', 'Discovery set: image beside the steps.', null, [{ name: 'file_type_options', value: '["Image"]' }]],
    ['gallery_eyebrow', 'Gallery caption eyebrow', 'single_line_text_field', 'Discovery set: small line under the gallery.'],
    ['gallery_caption', 'Gallery caption', 'single_line_text_field', 'Discovery set: serif line under the gallery.'],
    ['consultation_url', 'Consultation link', 'url', 'Discovery set: "Book a consultation" button.'],
  ];

  for (const [key, name, type, description, refId, extra] of defs) {
    const validations = [...(extra || [])];
    if (refId) validations.push({ name: 'metaobject_definition_id', value: refId });
    await createDefinition({ ownerType: 'PRODUCT', namespace: 'custom', key, name, type, description, validations, pin: true });
  }
  await createDefinition({
    ownerType: 'PRODUCTVARIANT', namespace: 'custom', key: 'caption', name: 'Caption',
    type: 'single_line_text_field', description: 'Small line on the variant card, e.g. "Full bottle".', validations: [], pin: true,
  });
}

async function createDefinition({ pin, ...definition }) {
  let r = await sendDefinition(definition, pin);
  // Shopify caps pinned definitions per resource; fall back to unpinned.
  if (r.userErrors.some((e) => e.code === 'PINNED_LIMIT_REACHED')) r = await sendDefinition(definition, false);
  const skipped = userErrors(r, `definition ${definition.key}`, { allow: ['TAKEN'] });
  console.log(`${skipped ? '•' : '✓'} ${definition.ownerType.toLowerCase()} metafield custom.${definition.key}${skipped ? ' (exists)' : ''}`);
}

async function sendDefinition(definition, pin) {
  const { metafieldDefinitionCreate: r } = await gql(
    `mutation($d: MetafieldDefinitionInput!) {
      metafieldDefinitionCreate(definition: $d) { createdDefinition { id } userErrors { field message code } }
    }`,
    { d: { ...definition, pin, access: { storefront: 'PUBLIC_READ' } } }
  );
  return r;
}

/* ---------- 3. Notes ---------- */

async function ensureNotes() {
  const ids = {};
  for (const [name, url] of Object.entries(data.notes)) {
    const handle = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const found = await gql(`query($h: MetaobjectHandleInput!) { metaobjectByHandle(handle: $h) { id } }`, {
      h: { type: 'scent_note', handle },
    });
    if (found.metaobjectByHandle) {
      ids[name] = found.metaobjectByHandle.id;
      console.log(`• note ${name} (exists)`);
      continue;
    }
    const { fileCreate: f } = await gql(
      `mutation($files: [FileCreateInput!]!) { fileCreate(files: $files) { files { id } userErrors { field message code } } }`,
      { files: [{ originalSource: url, contentType: 'IMAGE', alt: name, filename: `note-${handle}.jpg` }] }
    );
    userErrors(f, `file for ${name}`);
    const { metaobjectCreate: m } = await gql(
      `mutation($m: MetaobjectCreateInput!) { metaobjectCreate(metaobject: $m) { metaobject { id } userErrors { field message code } } }`,
      { m: { type: 'scent_note', handle, fields: [{ key: 'name', value: name }, { key: 'image', value: f.files[0].id }] } }
    );
    userErrors(m, `note ${name}`);
    ids[name] = m.metaobject.id;
    console.log(`✓ note ${name}`);
  }
  return ids;
}

/* ---------- 4. Products + collections ---------- */

async function upsertProduct(p) {
  const files = p.images.map((src, i) => ({ originalSource: src, contentType: 'IMAGE', alt: `${p.vendor} ${p.display_name}, view ${i + 1}` }));
  const optionName = p.optionName || 'Size';
  const input = {
    title: p.title,
    handle: p.handle,
    vendor: p.vendor,
    productType: p.productType || 'Fragrance',
    status: 'ACTIVE',
    templateSuffix: p.template || null,
    descriptionHtml: p.descriptionHtml || '',
    tags: p.tags || [],
    files,
    productOptions: [{ name: optionName, values: p.variants.map((v) => ({ name: v.option })) }],
    variants: p.variants.map((v) => ({
      optionValues: [{ optionName, name: v.option }],
      price: v.price,
      inventoryItem: { tracked: false },
      inventoryPolicy: 'CONTINUE',
      ...(v.caption ? { metafields: [{ namespace: 'custom', key: 'caption', type: 'single_line_text_field', value: v.caption }] } : {}),
    })),
    metafields: Object.entries(p.metafields || {})
      .filter(([, mf]) => mf.value != null)
      .map(([key, mf]) => ({ namespace: 'custom', key, type: mf.type, value: mf.value })),
  };

  const { productSet: r } = await gql(
    `mutation($input: ProductSetInput!, $id: ProductSetIdentifiers) {
      productSet(input: $input, identifier: $id, synchronous: true) {
        product { id handle variants(first: 5) { nodes { id title } } }
        userErrors { field message code }
      }
    }`,
    { input, id: { handle: p.handle } }
  );
  userErrors(r, `product ${p.handle}`);
  console.log(`✓ product ${p.handle}`);
  return r.product;
}

async function ensureCollection(handle, title, productIds) {
  const found = await gql(`query($h: String!) { collectionByHandle(handle: $h) { id } }`, { h: handle });
  let id = found.collectionByHandle && found.collectionByHandle.id;
  const created = !id;
  if (!id) {
    const { collectionCreate: r } = await gql(
      `mutation($c: CollectionInput!) { collectionCreate(input: $c) { collection { id } userErrors { field message } } }`,
      { c: { title, handle } }
    );
    userErrors(r, `collection ${handle}`);
    id = r.collection.id;
  }
  if (!productIds.length) {
    if (created) console.log(`✓ collection ${handle}`);
    return id;
  }
  const { collectionAddProductsV2: a } = await gql(
    `mutation($id: ID!, $p: [ID!]!) { collectionAddProductsV2(id: $id, productIds: $p) { userErrors { field message code } } }`,
    { id, p: productIds }
  );
  userErrors(a, `collection ${handle} products`, { allow: ['PRODUCT_ALREADY_IN_COLLECTION'] });
  console.log(`✓ collection ${handle}`);
  return id;
}

async function setMetafield(ownerId, key, type, value) {
  const { metafieldsSet: r } = await gql(
    `mutation($m: [MetafieldsSetInput!]!) { metafieldsSet(metafields: $m) { userErrors { field message code } } }`,
    { m: [{ ownerId, namespace: 'custom', key, type, value }] }
  );
  userErrors(r, `metafield ${key}`);
}

async function publishAll(ids) {
  const { publications } = await gql(`{ publications(first: 20) { nodes { id name } } }`);
  const online = publications.nodes.find((p) => /online store/i.test(p.name));
  if (!online) {
    console.warn('! Online Store publication not found; publish the products manually.');
    return;
  }
  for (const id of ids) {
    const { publishablePublish: r } = await gql(
      `mutation($id: ID!, $p: [PublicationInput!]!) { publishablePublish(id: $id, input: $p) { userErrors { field message } } }`,
      { id, p: [{ publicationId: online.id }] }
    );
    userErrors(r, `publish ${id}`);
  }
  console.log(`✓ published ${ids.length} items to Online Store`);
}

/* ---------- Run ---------- */

const text = (v) => ({ type: 'single_line_text_field', value: v });
const list = (v) => ({ type: 'list.single_line_text_field', value: json(v) });

(async () => {
  console.log(`Setting up ${STORE} (API ${API_VERSION})\n`);
  const defIds = {};
  for (const type of Object.keys(METAOBJECTS)) defIds[type] = await ensureMetaobjectDefinition(type);
  await ensureMetafieldDefinitions(defIds);
  const notes = await ensureNotes();

  const faqRefs = async (prefix, items) => {
    const ids = [];
    for (const [i, [question, answer]] of items.entries()) {
      ids.push(await upsertMetaobject('faq', `${prefix}-${i + 1}`, { question, answer: richText([answer]) }));
    }
    console.log(`✓ ${items.length} FAQs for ${prefix}`);
    return { type: 'list.metaobject_reference', value: json(ids) };
  };
  const stepIds = [];
  for (const [i, step] of data.discovery.steps.entries()) {
    stepIds.push(await upsertMetaobject('discovery_step', `discovery-step-${i + 1}`, step));
  }
  console.log(`✓ ${stepIds.length} discovery steps`);
  const refs = (names) => ({ type: 'list.metaobject_reference', value: json(names.map((n) => notes[n])) });

  const related = [];
  for (const r of data.related) {
    related.push(
      await upsertProduct({
        ...r,
        variants: [{ option: r.size, price: r.price }],
        metafields: {
          display_name: text(r.display_name),
          badge: text(r.badge),
          key_notes: list(r.key_notes),
          size_label: text(r.size),
          scent_families: list(r.families),
        },
      })
    );
  }

  const L = data.lamar;
  const kajal = await ensureCollection('kajal', 'Kajal', []);
  const lamar = await upsertProduct({
    ...L,
    template: 'fragrance',
    descriptionHtml: `<p>${L.story_intro}</p>`,
    metafields: {
      display_name: text(L.display_name),
      badge: text(L.badge),
      tagline: text(L.tagline),
      scent_families: list(L.families),
      top_notes: refs(L.top_notes),
      heart_notes: refs(L.heart_notes),
      base_notes: refs(L.base_notes),
      main_accords: list(L.main_accords),
      wear_opening: text(L.wear_opening),
      wear_heart: text(L.wear_heart),
      wear_drydown: text(L.wear_drydown),
      longevity: text(L.longevity),
      longevity_hours: { type: 'number_integer', value: String(L.longevity_hours) },
      projection: text(L.projection),
      occasions: list(L.occasions),
      seasons: list(L.seasons),
      story_intro: { type: 'multi_line_text_field', value: L.story_intro },
      story_full: { type: 'rich_text_field', value: richText(L.story_full) },
      key_notes: list(L.key_notes),
      size_label: text('100ml'),
      related_products: { type: 'list.product_reference', value: json(related.map((p) => p.id)) },
      house_collection: { type: 'collection_reference', value: kajal },
      faqs: await faqRefs('lamar', L.faqs),
      delivery_note: text('Ships from South Yarra next business day'),
    },
  });
  await ensureCollection('kajal', 'Kajal', [lamar.id]);
  const fragrances = await ensureCollection('fragrances', 'Fragrances', [lamar.id, ...related.map((p) => p.id)]);

  const D = data.discovery;
  const discovery = await upsertProduct({
    ...D,
    template: 'discovery-set',
    productType: 'Samples',
    descriptionHtml: `<p>${D.description}</p>`,
    variants: [{ option: 'Default Title', price: D.price }],
    optionName: 'Title',
    metafields: {
      display_name: text(D.display_name),
      tagline: text(D.tagline),
      set_size: { type: 'number_integer', value: '6' },
      sample_size: text('3ml'),
      discovery_collection: { type: 'collection_reference', value: fragrances },
      faqs: await faqRefs('discovery-set', D.faqs),
      steps: { type: 'list.metaobject_reference', value: json(stepIds) },
      gallery_eyebrow: text('Six scents. Your own story.'),
      gallery_caption: text('A little collection of possibilities.'),
    },
  });
  const samples = await ensureCollection('samples', 'Samples', [discovery.id]);
  await setMetafield(lamar.id, 'discovery_product', 'product_reference', discovery.id);

  await publishAll([lamar.id, discovery.id, ...related.map((p) => p.id), kajal, fragrances, samples]);

  console.log(`\nDone. Preview with the unpublished theme:
  https://${STORE}/products/${L.handle}
  https://${STORE}/products/${D.handle}`);
})().catch((e) => fail(e.stack || e.message));

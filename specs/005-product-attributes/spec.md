# Feature Specification: Product Attributes System

**Feature Branch**: `005-product-attributes`

**Created**: 2026-07-03

**Status**: Draft

**Input**: User description: "Add product attributes system: attribute dictionary table, JSONB attributes column on products table with GIN index, import from Venus API /v1/attributes/PRODUCT endpoint, extract attributes from product API responses, feed into RAG searchable text and chunk metadata, TypeScript-level attribute slot scoring in HybridRetrieverService."

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Admin Imports Attribute Catalog (Priority: P1)

An admin triggers an attribute catalog import. The system fetches all known product attribute types (e.g. "Острота", "Тип теста", "Вид ролла") from the catalog service and stores them in a dedicated reference table.

**Why this priority**: Without the catalog, there's no reference for what attributes exist. All downstream features depend on this step.

**Independent Test**: Trigger attribute import via the API; verify the attribute catalog table is populated with at least one attribute record.

**Acceptance Scenarios**:

1. **Given** the catalog service is available, **When** the admin calls `POST /v1/import/attributes` with a valid retail network identifier, **Then** the system fetches all attribute definitions and stores them, returning the count of imported attributes.
2. **Given** the attribute catalog was previously imported, **When** the admin triggers import again, **Then** existing attributes are updated (name, type) and new ones are added — no duplicates created.
3. **Given** the catalog service is unavailable, **When** the admin triggers import, **Then** the system records a failed job and returns an error response; no partial data is committed.

---

### User Story 2 — Products Carry Attribute Values After Import (Priority: P1)

After the product catalog is imported (or re-imported), each product record in the system stores its attribute values (e.g. product X has `Острота: умеренная`, `Тип теста: рисовое`).

**Why this priority**: Without attribute values on products, the AI assistant cannot use them for search or scoring.

**Independent Test**: Import products via existing `POST /v1/import/products`; verify products in DB have non-empty attribute values for products that carry attributes in the source catalog.

**Acceptance Scenarios**:

1. **Given** a product in the catalog has attributes, **When** a product import runs, **Then** the product record includes all attribute values from the catalog source.
2. **Given** a product has no attributes in the catalog, **When** a product import runs, **Then** the product record stores an empty attribute list (no error).
3. **Given** products were previously imported without attributes, **When** a product import is re-run, **Then** existing product records are updated with attribute values.

---

### User Story 3 — AI Assistant Finds Products by Attribute (Priority: P2)

A user asks the AI assistant for products with a specific characteristic expressed in natural language (e.g. "хочу что-нибудь острое", "есть ли не острые роллы?"). The AI returns relevant products matched by attribute, not just by name or ingredients.

**Why this priority**: This is the end-user value of the entire feature — improved relevance for attribute-based queries.

**Independent Test**: After importing products with attributes, send a query about spiciness to `POST /v1/assistant/product-answer`; verify the top results include products tagged with the matching spice-level attribute.

**Acceptance Scenarios**:

1. **Given** products with spice-level attributes are indexed, **When** a user asks "хочу острое", **Then** the assistant returns products with a high spice-level attribute in the top results.
2. **Given** products with attribute values in the search index, **When** a user queries an attribute by its human-readable name (e.g. "классические роллы"), **Then** the assistant finds matching products via full-text search over attribute values.
3. **Given** no products match the requested attribute, **When** the user asks about it, **Then** the assistant returns a relevant fallback response (existing fallback behavior).

---

### User Story 4 — Attribute-Enhanced Scoring for Combined Queries (Priority: P2)

When a user's query includes both an attribute and other criteria (e.g. "острый ролл с лососем"), the AI scores products higher if they match the attribute in addition to other criteria.

**Why this priority**: Improves ranking quality for compound queries; builds on US3.

**Independent Test**: Send a combined attribute + ingredient query; verify that products matching both rank above products matching only one.

**Acceptance Scenarios**:

1. **Given** products A (spicy + salmon) and B (not spicy + salmon), **When** a user asks for "острый с лососем", **Then** product A ranks higher than product B.
2. **Given** a product matches attribute but not other criteria, **When** it is scored, **Then** it receives a partial score boost (not a full match).

---

### Edge Cases

- What happens when the attribute catalog API returns an empty list? Import completes with `imported: 0`; no existing records are deleted.
- What happens when a product's attribute value in the source is an unexpected type (e.g. array instead of scalar)? The value is coerced to string; import does not fail.
- What happens when the same attribute code appears twice in the catalog response? The second occurrence overwrites the first; final result has one record per code.
- What if a product's attribute references a code not in the catalog? The value is still stored; no FK constraint blocks it (catalog and product attributes are loosely coupled).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide an endpoint to trigger attribute catalog import for a given retail network.
- **FR-002**: System MUST store each attribute definition (code, human-readable name, value type) in a dedicated reference table, keyed by retail network and attribute code.
- **FR-003**: System MUST upsert attribute definitions on re-import — update existing records, add new ones, never create duplicates.
- **FR-004**: System MUST extract attribute values from product data during product import and store them on each product record.
- **FR-005**: System MUST include attribute values in the searchable text used to build product search indexes, in a human-readable format (e.g. "Острота: умеренная").
- **FR-006**: System MUST include attribute values in product search index metadata so they are available for structured retrieval alongside search results.
- **FR-007**: System MUST apply a scoring bonus when a product's attributes match slots inferred from the user's query, consistent with other slot-match bonuses in the ranking pipeline.
- **FR-008**: System MUST record an import job for attribute catalog imports (with success/failure status and count statistics), consistent with existing import job tracking.
- **FR-009**: System MUST handle the case where a product has no attributes without error — storing an empty list.
- **FR-010**: System MUST preserve the full raw attribute catalog response per attribute definition for future reference.

### Key Entities

- **Attribute Definition**: A type of product characteristic defined by the catalog (e.g. "Острота"). Has a code (machine key), human-readable name, optional value type, and belongs to a retail network.
- **Product Attribute Value**: A specific attribute value on a product (e.g. `Острота: умеренная`). Belongs to a product and references an attribute by code and name.
- **Import Job**: Tracks the outcome of an attribute catalog import — status, count of imported definitions, errors.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After an attribute import, the attribute catalog table contains all attribute definitions returned by the source catalog (0 missing, 0 duplicates).
- **SC-002**: After a product import, at least 80% of products that carry attributes in the source have non-empty attribute values in the database.
- **SC-003**: A query about a product characteristic expressed in natural language (e.g. "острое") returns at least one correctly matching product in the top 5 results, for products known to carry that attribute.
- **SC-004**: Combined queries (attribute + other criteria) rank fully-matching products above partially-matching products in at least 90% of test cases.
- **SC-005**: Attribute import completes in under 10 seconds for a catalog of up to 100 attribute definitions.
- **SC-006**: Product import with attribute extraction adds no more than 5% overhead compared to import without attributes.

## Assumptions

- The attribute catalog source is stable and available at the same endpoint used by the product import; no additional authentication beyond what the existing catalog client already handles.
- Attribute values in product data are scalar (string or number); complex nested values are coerced to string.
- The attribute catalog is global per retail network (not per city/branch/target) — one import per `rn` covers all branches.
- Existing product search indexes will be rebuilt via re-import after attributes are added; no separate re-indexing job is needed.
- The attribute scoring bonus is additive and does not replace existing ingredient/tag scoring bonuses.
- Mock/test data will include 2–3 representative attribute types to enable testing without the live catalog API.

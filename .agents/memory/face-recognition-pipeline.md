---
name: Face Recognition Pipeline Upgrades
description: Critical bugs fixed and accuracy improvements made to the school attendance face recognition pipeline.
---

# Face Recognition Pipeline — Key Decisions

## Fixed Bugs (were silently destroying accuracy)

**1. Wrong match threshold (0.62 → 0.45)**
The old 0.62 Euclidean threshold was so permissive that completely different people could match. face-api.js same-person range is 0.30–0.45; threshold must be ≤ 0.45.

**2. Broken cosine/Euclidean mixing**
Old code: `min(euclidean, cosine)` — taking the minimum always inflates confidence.
face-api.js descriptors are NOT L2-normalised so cosine distance is NOT comparable to Euclidean.
Fix: use only Euclidean distance for face-api.js FaceRecognitionNet descriptors.

**3. Fake "3D point cloud" scoring**
Old code treated descriptor dims [0,1,2] as (x,y,z) spatial coordinates. Completely meaningless.
Fix: removed entirely.

**4. Averaged descriptor normalised to unit-length**
Old `averageDescriptors()` L2-normalised the result, changing scale and breaking Euclidean comparison.
Fix: robust average without normalisation, with outlier rejection (2.5× median deviation cutoff).

**5. Mixed-dimension descriptor crash**
If 128-dim and 512-dim descriptors existed for the same user, averaging produced NaN.
Fix: partition by dimension, keep the majority group.

## New Services Added

- `FaceAlignmentService.ts` — 2-point similarity alignment (eyes → canonical 112×112)
- `FaceQualityService.ts` — Laplacian sharpness + brightness + size scoring, rejects score < 0.35

## New Function in ModelService

`getAlignedFaceDescriptor()` — preferred capture path:
1. SSD MobileNetV1 detect (minConfidence 0.5)
2. Frontal face check (eye vertical asymmetry < 57.7% of eye distance)
3. Align to 112×112 using eye landmarks
4. Quality score gate (default 0.30 minimum)
5. Re-detect on aligned crop → FaceRecognitionNet descriptor

**Why:** alignment is the single biggest accuracy improvement available without changing models.

## Ambiguity Rejection (new)

If best and second-best match distances are within 18% of each other (ratio > 0.82), reject as ambiguous rather than guess. Prevents look-alike students triggering each other's attendance.

## Confidence Calibration (new)

Sigmoid: `1 / (1 + exp(14 * (dist - 0.45)))` maps Euclidean → probability.
dist=0.30 → ~92%, dist=0.45 → ~50%, dist=0.55 → ~18%.

## Auto-mark threshold

`AUTO_MARK_CONFIDENCE = 0.80` (confidence ≥ 80% for automatic attendance marking without manual confirmation).

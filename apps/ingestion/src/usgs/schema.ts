import { z } from 'zod';

const NullableNumber = z.number().nullable();

export const UsgsFeatureSchema = z
  .object({
    type: z.literal('Feature'),
    id: z.string().min(1),
    geometry: z.object({
      type: z.literal('Point'),
      coordinates: z.tuple([z.number(), z.number(), z.number()]),
    }),
    properties: z
      .object({
        mag: NullableNumber,
        place: z.string().nullable(),
        time: z.number().int(),
        updated: z.number().int(),
        url: z.url(),
        detail: z.url().optional(),
        felt: z.number().int().nonnegative().nullable(),
        cdi: NullableNumber.optional(),
        mmi: NullableNumber.optional(),
        alert: z.string().nullable().optional(),
        status: z.string().min(1),
        tsunami: z.union([z.literal(0), z.literal(1)]),
        sig: z.number().int().nonnegative(),
        net: z.string().min(1),
        code: z.string().min(1),
        ids: z.string(),
        sources: z.string(),
        types: z.string(),
        nst: z.number().int().nullable().optional(),
        dmin: NullableNumber.optional(),
        rms: NullableNumber.optional(),
        gap: NullableNumber.optional(),
        magType: z.string().nullable(),
        type: z.string().min(1),
      })
      .passthrough(),
  })
  .passthrough();

export const UsgsFeatureCollectionSchema = z
  .object({
    type: z.literal('FeatureCollection'),
    metadata: z
      .object({
        generated: z.number().int(),
        url: z.string(),
        title: z.string(),
        api: z.string().optional(),
        count: z.number().int().nonnegative(),
        status: z.number().int().optional(),
      })
      .passthrough(),
    bbox: z.array(z.number()).optional(),
    features: z.array(UsgsFeatureSchema),
  })
  .passthrough();

export type UsgsFeature = z.infer<typeof UsgsFeatureSchema>;
export type UsgsFeatureCollection = z.infer<typeof UsgsFeatureCollectionSchema>;

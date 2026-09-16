import {
  ClassifierParametersSchema,
  DEFAULT_CLASSIFIER_PARAMETERS,
  type ClassifierParameters,
} from '@earthquake/classification';

function configuredNumber(environment: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const value = environment[name];
  return value === undefined ? fallback : Number(value);
}

export function classifierParameters(
  environment: NodeJS.ProcessEnv = process.env,
): ClassifierParameters {
  return ClassifierParametersSchema.parse({
    baseTimeWindowHours: configuredNumber(
      environment,
      'SERIES_BASE_TIME_WINDOW_HOURS',
      DEFAULT_CLASSIFIER_PARAMETERS.baseTimeWindowHours,
    ),
    baseDistanceKm: configuredNumber(
      environment,
      'SERIES_BASE_DISTANCE_KM',
      DEFAULT_CLASSIFIER_PARAMETERS.baseDistanceKm,
    ),
    magnitudeReference: configuredNumber(
      environment,
      'SERIES_MAGNITUDE_REFERENCE',
      DEFAULT_CLASSIFIER_PARAMETERS.magnitudeReference,
    ),
    magnitudeWindowScale: configuredNumber(
      environment,
      'SERIES_MAGNITUDE_WINDOW_SCALE',
      DEFAULT_CLASSIFIER_PARAMETERS.magnitudeWindowScale,
    ),
    timeWeight: configuredNumber(
      environment,
      'SERIES_TIME_WEIGHT',
      DEFAULT_CLASSIFIER_PARAMETERS.timeWeight,
    ),
    distanceWeight: configuredNumber(
      environment,
      'SERIES_DISTANCE_WEIGHT',
      DEFAULT_CLASSIFIER_PARAMETERS.distanceWeight,
    ),
    magnitudeWeight: configuredNumber(
      environment,
      'SERIES_MAGNITUDE_WEIGHT',
      DEFAULT_CLASSIFIER_PARAMETERS.magnitudeWeight,
    ),
    minimumEdgeScore: configuredNumber(
      environment,
      'SERIES_MINIMUM_EDGE_SCORE',
      DEFAULT_CLASSIFIER_PARAMETERS.minimumEdgeScore,
    ),
    minimumSeriesSize: configuredNumber(
      environment,
      'SERIES_MINIMUM_SIZE',
      DEFAULT_CLASSIFIER_PARAMETERS.minimumSeriesSize,
    ),
  });
}

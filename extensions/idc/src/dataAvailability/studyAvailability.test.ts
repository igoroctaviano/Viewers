import {
  checkStudyAvailability,
  describeError,
  isReferencedSeriesMissing,
} from './studyAvailability';

const STUDY = '1.2.3';
const CT = '1.2.3.1';
const SEG = '1.2.3.2';

const source = (sourceName: string, search: () => Promise<unknown[]>) => ({
  sourceName,
  label: sourceName,
  dataSource: { query: { series: { search } } },
});

describe('checkStudyAvailability', () => {
  it('reports found, empty and failed sources independently', async () => {
    const error = Object.assign(new Error('request failed'), {
      status: 403,
      request: { statusText: 'Forbidden' },
    });

    const result = await checkStudyAvailability(STUDY, [
      source('idc', () => Promise.resolve([])),
      source('gcp', () => Promise.resolve([{ seriesInstanceUid: SEG }])),
      source('other', () => Promise.reject(error)),
    ]);

    expect(result.sources.map(s => s.status)).toEqual(['empty', 'found', 'failed']);
    expect(result.sources[1].seriesInstanceUIDs.has(SEG)).toBe(true);
    expect(describeError(result.sources[2].error)).toBe('HTTP 403 Forbidden');
  });
});

describe('isReferencedSeriesMissing', () => {
  const availability = {
    StudyInstanceUID: STUDY,
    sources: [
      {
        sourceName: 'idc',
        label: 'idc',
        status: 'empty' as const,
        seriesInstanceUIDs: new Set<string>(),
      },
      {
        sourceName: 'gcp',
        label: 'gcp',
        status: 'found' as const,
        seriesInstanceUIDs: new Set([SEG]),
      },
    ],
  };

  it('is true when no source holds the referenced series', () => {
    expect(
      isReferencedSeriesMissing(
        { StudyInstanceUID: STUDY, referencedSeriesInstanceUID: CT },
        availability
      )
    ).toBe(true);
  });

  it('is false when a source holds the referenced series', () => {
    expect(
      isReferencedSeriesMissing(
        { StudyInstanceUID: STUDY, referencedSeriesInstanceUID: SEG },
        availability
      )
    ).toBe(false);
  });

  it('is false without a reference, for another study, or when every query failed', () => {
    expect(isReferencedSeriesMissing({ StudyInstanceUID: STUDY }, availability)).toBe(false);
    expect(
      isReferencedSeriesMissing(
        { StudyInstanceUID: '9.9', referencedSeriesInstanceUID: CT },
        availability
      )
    ).toBe(false);
    expect(
      isReferencedSeriesMissing(
        { StudyInstanceUID: STUDY, referencedSeriesInstanceUID: CT },
        {
          StudyInstanceUID: STUDY,
          sources: [
            { sourceName: 'idc', label: 'idc', status: 'failed', seriesInstanceUIDs: new Set() },
          ],
        }
      )
    ).toBe(false);
  });
});

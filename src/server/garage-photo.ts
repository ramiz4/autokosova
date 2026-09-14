import sharp from 'sharp';

const MAX_INPUT_BYTES = 5 * 1024 * 1024;
const MAX_INPUT_PIXELS = 20_000_000;
const MAX_OUTPUT_WIDTH = 1600;
const supportedFormats = new Map([
  ['image/jpeg', 'jpeg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
]);

export interface NormalizedGaragePhoto {
  readonly content: Buffer;
  readonly contentType: 'image/webp';
  readonly height: number;
  readonly width: number;
}

export class GaragePhotoError extends Error {}

/**
 * Produces a bounded public-photo derivative. Deliberately never calls sharp's
 * metadata-preserving APIs: the WebP output therefore contains no EXIF, XMP or
 * IPTC location metadata from the upload.
 */
export async function normalizeGaragePhoto(
  source: Buffer,
  declaredContentType: string | undefined,
): Promise<NormalizedGaragePhoto> {
  const mediaType = declaredContentType?.split(';', 1)[0]?.trim().toLowerCase();
  if (!mediaType || !supportedFormats.has(mediaType)) {
    throw new GaragePhotoError('Only JPEG, PNG or WebP photos are accepted');
  }
  if (source.length === 0 || source.length > MAX_INPUT_BYTES) {
    throw new GaragePhotoError('Photo size is invalid');
  }

  try {
    const image = sharp(source, { failOn: 'error', limitInputPixels: MAX_INPUT_PIXELS });
    const metadata = await image.metadata();
    if (!metadata.format || metadata.format !== supportedFormats.get(mediaType)) {
      throw new GaragePhotoError('Photo content does not match its declared type');
    }

    const result = await image
      .autoOrient()
      .resize({
        fit: 'inside',
        height: MAX_OUTPUT_WIDTH,
        width: MAX_OUTPUT_WIDTH,
        withoutEnlargement: true,
      })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });

    if (!result.info.width || !result.info.height) {
      throw new GaragePhotoError('Photo dimensions are invalid');
    }
    return {
      content: result.data,
      contentType: 'image/webp',
      height: result.info.height,
      width: result.info.width,
    };
  } catch (error) {
    if (error instanceof GaragePhotoError) throw error;
    throw new GaragePhotoError('Photo could not be processed safely');
  }
}

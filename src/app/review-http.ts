import { reviewLabel } from '../shared/review-copy';
import type { AppLanguage } from '../shared/i18n';
export class ReviewHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code?: string,
  ) {
    super('Review request failed');
  }
}
export function reviewCsrf(document: Document): string {
  return (
    document.cookie
      .split('; ')
      .find((v) => v.startsWith('autokosova_csrf='))
      ?.split('=')[1] ?? ''
  );
}
export async function reviewChecked(response: Response): Promise<Response> {
  if (!response.ok) {
    let code: string | undefined;
    try {
      const body = await response.json();
      if (typeof body?.code === 'string') code = body.code;
    } catch {
      /* Do not surface response bodies or server internals. */
    }
    throw new ReviewHttpError(response.status, code);
  }
  return response;
}
export async function reviewJson<T>(response: Response): Promise<T> {
  return (await reviewChecked(response)).json() as Promise<T>;
}
export function reviewError(error: unknown, language: AppLanguage): string {
  const status = error instanceof ReviewHttpError ? error.status : 0;
  const code = error instanceof ReviewHttpError ? error.code : undefined;
  return reviewLabel(
    code === 'self_review'
      ? 'selfReview'
      : status === 409
        ? 'conflict'
        : status === 403
          ? 'denied'
          : status === 404
            ? 'notFound'
            : status === 400 || status === 422
              ? 'invalid'
              : status === 503
                ? 'uploadUnavailable'
                : 'error',
    language,
  );
}

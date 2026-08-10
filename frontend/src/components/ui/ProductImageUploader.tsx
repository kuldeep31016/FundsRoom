import { useRef, useState, type ChangeEvent } from 'react';
import { ApiError, api } from '../../lib/api-client';
import { useToast } from '../../context/ToastContext';
import { Alert, Button } from './index';
import { ALLOWED_IMAGE_TYPES, type PresignedUpload, type Product } from '../../types/api';

/**
 * Two-step, direct-to-storage image upload:
 *   1. ask the API for a presigned PUT URL
 *   2. send the file straight to S3
 *   3. tell the API to attach the stored object to the product
 *
 * The file never passes through the API process, so a large upload cannot
 * exhaust the memory of a small hosting instance.
 */
export function ProductImageUploader({
  product,
  onChange,
  disabled = false,
}: {
  product: Product;
  onChange: (product: Product) => void;
  disabled?: boolean;
}) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Local object URL so the new image appears instantly, before any refetch. */
  const [preview, setPreview] = useState<string | null>(null);

  const busy = isUploading || isRemoving || disabled;
  const imageSrc = preview ?? product.imageUrl;

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Reset immediately so re-selecting the same file still fires a change event.
    event.target.value = '';
    if (!file) return;

    setError(null);

    if (!ALLOWED_IMAGE_TYPES.includes(file.type as (typeof ALLOWED_IMAGE_TYPES)[number])) {
      setError(`Unsupported file type. Use ${ALLOWED_IMAGE_TYPES.map((t) => t.replace('image/', '')).join(', ')}.`);
      return;
    }

    setIsUploading(true);
    try {
      const { data: upload } = await api.post<PresignedUpload>(
        `/products/${product.id}/image/upload-url`,
        { contentType: file.type, contentLength: file.size },
      );

      await api.uploadToPresignedUrl(upload.uploadUrl, file, upload.requiredHeaders);

      const { data: updated } = await api.post<Product>(`/products/${product.id}/image`, {
        key: upload.key,
      });

      setPreview(URL.createObjectURL(file));
      onChange(updated);
      toast.success('Image uploaded', `${product.name} now has a photo.`);
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : 'The image could not be uploaded. Please try again.';
      setError(message);
      if (err instanceof ApiError && err.code === 'STORAGE_NOT_CONFIGURED') {
        toast.error('Image storage is not configured', message);
      }
    } finally {
      setIsUploading(false);
    }
  }

  async function handleRemove() {
    setError(null);
    setIsRemoving(true);
    try {
      const { data: updated } = await api.delete<Product>(`/products/${product.id}/image`);
      setPreview(null);
      onChange(updated);
      toast.success('Image removed', `The photo for ${product.name} has been deleted.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'The image could not be removed.');
    } finally {
      setIsRemoving(false);
    }
  }

  return (
    <div className="image-uploader">
      <div className="image-uploader__preview">
        {imageSrc ? (
          <img src={imageSrc} alt={`${product.name} product photo`} />
        ) : (
          <div className="image-uploader__placeholder" aria-hidden="true">
            ▣
          </div>
        )}
      </div>

      <div className="image-uploader__controls">
        <p className="text-sm text-muted">
          JPEG, PNG, WebP or AVIF. Maximum 5 MB. Uploaded straight to object storage.
        </p>

        <div className="row row--wrap" style={{ gap: 'var(--space-2)' }}>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => inputRef.current?.click()}
            isLoading={isUploading}
            disabled={busy}
          >
            {isUploading ? 'Uploading…' : product.imageKey ? 'Replace image' : '↑ Upload image'}
          </Button>

          {product.imageKey ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRemove}
              isLoading={isRemoving}
              disabled={busy}
            >
              Remove
            </Button>
          ) : null}
        </div>

        <input
          ref={inputRef}
          type="file"
          accept={ALLOWED_IMAGE_TYPES.join(',')}
          onChange={handleFile}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
        />

        {error ? <Alert variant="danger">{error}</Alert> : null}
      </div>
    </div>
  );
}

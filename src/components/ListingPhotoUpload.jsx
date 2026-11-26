/** @file Owner photo upload with explicit public-sharing consent, separate from legal documents. */
import { useState } from 'react';
import { useI18n } from '../i18n/I18nProvider.jsx';
export default function ListingPhotoUpload({ boat, onUpload, disabled }) {
  const { t } = useI18n(),
    [file, setFile] = useState(null),
    [alt, setAlt] = useState(''),
    [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function upload() {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error('Use a JPEG or PNG boat photo up to 5 MB.');
      const data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1]);
        reader.onerror = () => reject(new Error('Unable to read photo.'));
        reader.readAsDataURL(file);
      });
      await onUpload({ mime: file.type, data, alt, consent });
      setFile(null);
      setConsent(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <fieldset className="photo-upload">
      <legend>{t('Public boat photo')}</legend>
      <p>
        {t(
          'Upload a real boat photo without people, identity documents or private information. Metadata is removed. A new review is required.',
        )}
      </p>
      {boat.hasPhoto && (
        <p>{t('A listing photo is saved. It is public only while the boat is approved.')}</p>
      )}
      <label>
        {t('Choose boat photo')}
        <input
          type="file"
          accept="image/png,image/jpeg"
          disabled={busy || disabled}
          onChange={(e) => setFile(e.target.files?.[0] || null)}
        />
      </label>
      <label>
        {t('Photo description for screen readers')}
        <input value={alt} maxLength={160} onChange={(e) => setAlt(e.target.value)} />
      </label>
      <label className="fleet-check">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        {t(
          'I have publishing rights and confirm this photo contains no personal or private information.',
        )}
      </label>
      <button
        type="button"
        className="outline"
        disabled={busy || disabled || !file || !consent || alt.trim().length < 5}
        onClick={upload}
      >
        {t(busy ? 'Processing photo…' : 'Save photo for review')}
      </button>
      {error && <p role="alert">{t(error)}</p>}
    </fieldset>
  );
}

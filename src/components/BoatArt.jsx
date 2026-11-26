/** @file React boat art view; authorization and authoritative state remain on the server. */
import { useI18n } from '../i18n/I18nProvider.jsx';
import { useId } from 'react';
export default function BoatArt({ boat }) {
  const { t, locale } = useI18n();
  const id = useId().replaceAll(':', '');
  return (
    <svg viewBox="0 0 600 350" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id={`sky-${id}`} x2="0" y2="1">
          <stop stopColor="#dcecea" />
          <stop offset="1" stopColor="#f0e8d4" />
        </linearGradient>
        <linearGradient id={`sea-${id}`} x2="0" y2="1">
          <stop stopColor="#a6c9c6" />
          <stop offset="1" stopColor="#699ea5" />
        </linearGradient>
      </defs>
      <path fill={`url(#sky-${id})`} d="M0 0h600v230H0z" />
      <circle cx="470" cy="90" r="36" fill="#eac68a" opacity=".7" />
      <path d="M0 205Q90 150 170 193T370 170T600 174V250H0Z" fill="#91b1ae" opacity=".5" />
      <path d="M0 227Q80 202 160 220T350 215T600 220V350H0Z" fill={`url(#sea-${id})`} />
      <g stroke="#d6e6e2" opacity=".5" strokeWidth="2">
        <path d="M20 255h110m300 0h100M90 290h110m250 0h140M10 330h220m130 0h110M235 270h170" />
      </g>
      <ellipse cx="318" cy="291" rx="150" ry="11" fill="#437780" opacity=".25" />
      <path d="M150 243Q300 255 475 238L436 278Q290 298 189 274Z" fill={boat.tone} />
      <path d="M155 243Q300 251 472 239" fill="none" stroke="#ede3ca" strokeWidth="6" />
      {boat.type === 'Wooden boat' ? (
        <>
          <path d="M298 85v159" stroke="#745739" strokeWidth="5" />
          <path d="M292 95L202 231h90Z" fill="#fffdf0" />
          <path d="M306 113v119h109Z" fill="#f6edda" />
          <path d="M195 253l-55 38" stroke="#a78459" strokeWidth="5" />
        </>
      ) : boat.type === 'Motor yacht' ? (
        <>
          <path d="M224 241l36-65h100l61 65Z" fill="#f9faf5" />
          <path d="M274 184h74l30 30H254Z" fill="#6d969f" />
          <path d="M275 172l12-16h50l20 16" fill="#f9faf5" />
          <path d="M194 231h244" stroke="#fff" strokeWidth="4" />
        </>
      ) : boat.type === 'Party pontoon' ? (
        <>
          <path d="M208 239v-75m204 75v-75" stroke="#ecebd9" strokeWidth="5" />
          <path d="M190 165h243l-18-15H206Z" fill="#ecebd9" />
          <path d="M206 214h206" stroke="#f5efdb" strokeWidth="10" />
        </>
      ) : (
        <>
          <path d="M245 238l39-48h57l51 50Z" fill="#f7f8f2" />
          <path d="M290 196h42l25 25h-87Z" fill="#86afb6" />
        </>
      )}
    </svg>
  );
}

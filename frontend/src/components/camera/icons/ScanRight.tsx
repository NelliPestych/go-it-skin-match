/**
 * Pose silhouette: face turned to the user's right.
 *
 * Adapted from `apps/quiz-il/src/assets/svg/scan-right.svg`.
 * Stroke colour follows `currentColor`; layout-only Tailwind class
 * dropped.
 */
export default function ScanRight() {
  return (
    <svg
      viewBox="0 0 65 65"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <g clipPath="url(#sc-icon-right-clip)">
        <path
          d="M25.6 37.2c-.8 8.1 3 16.4 4.2 20.6 0 0-11.2 2.3-19.9-.6 0 0-1.9-8.7-1.9-16.6-.4-5.9 2.2-32.7 16.2-36.4C38.2.5 50.3 6 54.4 11.9c3.4 5 3.6 11.7.7 14.3"
          strokeMiterlimit="10"
          strokeLinejoin="round"
        />
        <path
          d="M35.6 49.8s7 5.8 14.1 3.3c2.9-1.7 2.9-4.4 3.3-5.5.4-1.1 1.5-4.4 2.6-8.1 1.1-3.7-.1-6.8-.5-7.9-.4-1.1 0-3 0-4.1 0-1.1 1.2-10.3-7.6-17 0 0 .5 2.5-14.9 17.3-2.7 2.4-2.3 3-4.3 1.5"
          strokeMiterlimit="10"
          strokeLinejoin="round"
        />
        <path
          d="M42.6 53.5c-1.4 2.1-2.3 6.3-2.8 9.5M53.8 24.4s-2.6-.7-3.7 1.5c0 0-1.1 2.6.4 5.9 1.5 3.3 2.6 4.4 2.2 5.5-.4 1.1-4.4 1.1-5.1.4"
          strokeMiterlimit="10"
        />
        <path
          d="M43.3 28.5s-2.6 1.5-4.8 0M54.4 28.5s-.8.5-1.7.2M45.2 24.6s-2.9-1.6-8.6-.2M44.3 44.4s3.6 1.9 7.4 0"
          strokeMiterlimit="10"
          strokeLinejoin="round"
        />
        <path d="M20.7 58.4c-.3 1.1-1.2 3.6-2.5 4.6" />
        <path
          d="M29.8 31.3s-1.7-3.8-4.9-2.4c-2.1.9-2.9 3.9-.8 6.2 1.2 1.3 2.1 3.9 3.7 3.7 1.6-.3 2.1-1.7 2.1-1.7"
          strokeMiterlimit="10"
          strokeLinejoin="round"
        />
      </g>
      <defs>
        <clipPath id="sc-icon-right-clip">
          <path fill="#fff" transform="matrix(-1 0 0 1 65 0)" d="M0 0h65v65H0z" />
        </clipPath>
      </defs>
    </svg>
  );
}

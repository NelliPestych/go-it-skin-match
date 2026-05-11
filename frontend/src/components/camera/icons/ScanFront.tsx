/**
 * Pose silhouette: face turned toward the camera.
 *
 * Adapted from `apps/quiz-il/src/assets/svg/scan-front.svg`. The
 * source had a hard-coded `stroke="#DDD"` and a Tailwind
 * `fill-stroke` utility class — both are stripped here so the icon
 * inherits its parent's `color` (drives `currentColor`) and follows
 * our `.sc-progress-dot[data-state="..."]` styling.
 */
export default function ScanFront() {
  return (
    <svg
      viewBox="0 0 65 65"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeMiterlimit="10"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <g clipPath="url(#sc-icon-front-clip)">
        <path d="M40.786 54.071S39.357 59.786 41.857 63M22.214 54.071S24 59.786 21.5 63" />
        <path
          d="M34.358 13.714C35.429 17.643 41.5 28 49 29.071v2.143C47.572 45.857 42.215 55.5 33.644 58c-1.429.357-3.215.357-4.643 0-8.572-2.143-13.572-12.143-15.357-26.786v-1.428"
          strokeLinejoin="round"
        />
        <path
          d="M34.358 13.714c1.428 6.429-13.214 16.072-20.714 16.072M35.428 30.5s6.83-3.214 13.26 0M37.214 35.143s3.215 1.428 5.715 0"
          strokeLinejoin="round"
        />
        <path
          d="M15.071 29.786c3.572-1.072 6.429-1.072 8.215-.715 2.142.358 4.285 1.43 5.357 3.215 1.071 2.143 1.785 5.714 0 11.428 0 0 .714 1.429 5 .715"
          strokeLinejoin="round"
        />
        <path
          d="M25.428 35.143s-3.214 1.428-5.714 0M26.857 49.786s4.286 1.786 8.929 0"
          strokeLinejoin="round"
        />
        <path
          d="M22.17 57.91C10.74 58.983 4 55.858 4 55.858c3.571-11.071 3.571-30 3.571-30C7.571 13.357 18.286 3 31.143 3s23.571 10.357 23.571 22.857c0 0-.714 16.072 5.715 29.286 0 0-10.491 4.107-19.777 1.964"
          strokeLinejoin="round"
        />
      </g>
      <defs>
        <clipPath id="sc-icon-front-clip">
          <path fill="#fff" d="M0 0h65v65H0z" />
        </clipPath>
      </defs>
    </svg>
  );
}

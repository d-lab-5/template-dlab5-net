import * as React from "react";

/**
 * What a visitor sees before signing in.
 *
 * ADR-0002 settled that there is no anonymous access and no self-service
 * sign-up. Nothing here is fetched, no workspace is named, and the only
 * control that does anything is the sign-in form passed in as `children`. A
 * page that showed counts, names or a "recent activity" strip would be leaking
 * to someone who has not signed in.
 *
 * What it is NOT is a bare password box on an empty background. A visitor
 * should arrive at something that says what this is.
 *
 * The `<Art/>` below is a placeholder, and it is the right thing to replace
 * first. The pattern worth copying is blueprinting's: it draws the ArchiMate
 * metamodel itself — sixty element types joined where the specification
 * permits a relationship — compiled into the bundle, so it costs no network
 * call and reveals nothing, because it is the published specification and is
 * identical for every visitor. Decorative geometry would have been easier and
 * would have meant nothing. Draw the thing your app is about.
 */
export function GuestLanding({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell app-shell--railed app-shell--guest">
      <nav className="app-rail" aria-label="Sign in">
        <span className="app-rail__brand">
          <Mark />
          <span>
            template<span className="app-rail__brandaccent">.dlab5</span>
          </span>
        </span>

        <div className="app-rail__section">
          <h2 className="app-rail__sectionlabel">Access</h2>
          {children}
        </div>

        <div className="app-rail__section">
          <h2 className="app-rail__sectionlabel">Accounts</h2>
          <p className="app-rail__note">
            There is no sign-up. Accounts are created by an administrator, who
            also grants access to a workspace. If you were invited, use the
            temporary password from your invitation email — you will be asked
            to choose a new one.
          </p>
        </div>
      </nav>

      <div className="app-shell__body">
        <main className="app-shell__main">
          <div className="app-hero">
            <div className="app-hero__copy">
              <p className="app-hero__eyebrow">D-LAB-5</p>
              <h1 className="app-hero__title">
                A starting point,{" "}
                <span className="app-hero__titleaccent">not a product</span>
              </h1>
              <p className="app-hero__lede">
                Gatsby 5 and React 18 in front, an AWS Amplify Gen 2 backend
                behind, and one Cognito gate over the whole thing. Fork it, run{" "}
                <code>npm run rename</code>, and start on the part that is
                actually yours.
              </p>
            </div>
            <Art />
          </div>
        </main>
      </div>
    </div>
  );
}

function Mark() {
  return (
    <span className="app-mark" aria-hidden="true">
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        strokeWidth="2"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="3" y="3" width="18" height="18" rx="4" />
        <path d="M8 8h8M8 12h5M8 16h3" />
      </svg>
    </span>
  );
}

/**
 * Placeholder art: the three tiers this template ships, stacked.
 *
 * Drawn from the categorical tokens rather than fixed colours, so it follows
 * the theme like everything else — and so that replacing it does not leave a
 * stray hex code behind.
 */
function Art() {
  const tiers = [
    { label: "site", y: 8, fill: "var(--app-cat-1)" },
    { label: "core", y: 48, fill: "var(--app-cat-3)" },
    { label: "backend", y: 88, fill: "var(--app-cat-4)" },
  ];

  return (
    <svg className="app-hero__art" viewBox="0 0 200 130" aria-hidden="true">
      {tiers.map((tier) => (
        <g key={tier.label}>
          <rect
            x="10"
            y={tier.y}
            width="180"
            height="30"
            rx="6"
            fill={tier.fill}
            fillOpacity={0.16}
            stroke={tier.fill}
            strokeOpacity={0.6}
          />
          <text
            x="24"
            y={tier.y + 20}
            fill="var(--app-text-muted)"
            fontSize="11"
            fontFamily="var(--app-font-mono)"
          >
            {tier.label}
          </text>
        </g>
      ))}
      {/* The two seams that matter: site imports core, backend stands apart. */}
      <path
        d="M100 38v10M100 78v10"
        stroke="var(--app-border-strong)"
        strokeWidth="1.5"
        strokeDasharray="3 3"
      />
    </svg>
  );
}

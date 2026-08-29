import { defineAuth } from "@aws-amplify/backend";

/**
 * The Cognito User Pool.
 *
 * There is no guest tier and no self-signup: the landing page IS the sign-in
 * page (ADR-0002). Accounts are created by an administrator, which is why the
 * invitation email below is the normal first-contact path rather than an edge
 * case. Self-signup is closed at the USER POOL level in backend.ts via
 * `adminCreateUserConfig` — defineAuth does not expose that switch, and
 * hiding the control in the UI would not stop a direct API call.
 *
 * Only ONE static group is declared here:
 *
 *   - app-admins   Platform administrators. Read and write every workspace,
 *                  create workspaces, manage Cognito users and groups.
 *
 * Per-workspace groups are deliberately NOT declared here. Each workspace owns
 * a Cognito group named `app-<slug>` (see Workspace.group in
 * data/resource.ts). Declaring them in `defineAuth` would mean a backend
 * deploy per new workspace, and Amplify's static `defineStorage` rules cannot
 * reference them anyway — which is exactly why S3 access goes through the
 * objectProxy function instead. ADR-0004.
 *
 * In this template the `app-<slug>` group is created BY HAND in the Cognito
 * console when a workspace is created. A fork that outgrows that should add an
 * admin function minting the row and the group in one mutation — see the note
 * at the foot of backend.ts for the CloudFormation trap it has to avoid.
 */
export const auth = defineAuth({
  loginWith: {
    email: {
      verificationEmailStyle: "CODE",
      verificationEmailSubject: "D-LAB-5 — verification code",
      verificationEmailBody: (createCode) =>
        `Your verification code is: ${createCode()}`,
      userInvitation: {
        emailSubject: "D-LAB-5 — your access",
        emailBody: (user, code) =>
          `An account has been created for you.\n\n` +
          `Username: ${user()}\n` +
          `Temporary password: ${code()}\n\n` +
          `Sign in at https://template.dlab5.net/ — you will be asked to ` +
          `choose a new password.`,
      },
    },
  },
  groups: ["app-admins"],
  accountRecovery: "EMAIL_ONLY",
});

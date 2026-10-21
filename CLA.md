# WarpCad Contributor Licence Agreement

**Draft, pending legal review (`docs/decisions/app-store-licensing.md`, Part 6).** Do not rely on
it for a legal decision until that review is recorded there.

Thank you for contributing to WarpCad. This agreement says what you grant when you send a change
to the project, and what the project will do with it. Please read it before you open a pull request.

## 1. What you keep

You keep the copyright in your contributions. Nothing here transfers ownership to anyone.

## 2. What you promise

By opening a pull request or otherwise submitting a contribution, you confirm that:

- you wrote it, or you have the right to submit it under this agreement;
- if your employer may own what you write, you have its permission to contribute, or the
  contribution is outside what it owns;
- you have told the project about any third-party material in it, and that material is under a
  licence compatible with the terms in section 4.

You are not obliged to contribute anything, and you can stop at any time. Contributions already
accepted stay under this agreement.

## 3. What you grant

You grant the project owner, John Cole, and anyone the owner names as a successor, a perpetual,
irrevocable, worldwide, non-exclusive, royalty-free licence to use, reproduce, modify, prepare
derivative works of, publicly display, publicly perform, sublicense and distribute your
contribution, in source and object form, **under any terms**, including terms that differ from the
public licence in section 4. The sublicensing right is what lets the owner distribute a separate
build, such as an App Store build, under its own terms.

You also grant a patent licence on the same terms, limited to patent claims that your contribution
alone or in combination with the project would necessarily infringe, and you agree not to assert
such claims against the project or its users for that contribution.

## 4. What the public project keeps

The public repository keeps distributing your contribution under its existing licences whatever
this agreement says: **AGPL-3.0-or-later** for code and **CC BY-SA 4.0** for prose, as marked in
each file and in [`LICENSING.md`](LICENSING.md). The grant in section 3 adds a right for the owner;
it does not remove any right the public licence gives you or anyone else.

## 5. Other things you should know

- **No warranty.** Your contribution is provided as is, without warranty of any kind.
- **Attribution.** The project keeps the copyright notices and author lines that are already in
  a file. It does not remove them when it relicenses.
- **AI-assisted work.** You may use an AI tool to write a contribution. You are the person who
  submits it and certifies it under section 2, and the same grant applies. Say so in the pull
  request if the tool produced a large part of the change.
- **Governing law.** [Not yet chosen. To be set at the legal review in `docs/decisions/app-store-licensing.md`,
  Part 6.]

## 6. Signing

Sign by commenting this exact sentence on your pull request:

> I have read the CLA Document and I hereby sign the CLA

The `cla` check on your pull request turns green once you have signed. Your signature is recorded in
[`.github/cla-signatures.json`](.github/cla-signatures.json) on the `cla-signatures` branch, against
the GitHub login and the email address of the author. You sign once, and it covers every later
pull request from the same email address.

The owner and the bots allow-listed in `.github/workflows/cla.yml` (Dependabot and GitHub Actions)
do not need to sign. Their changes are to lockfiles and workflow pins, not authored code.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->

# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Latin students at school or university, using the site to get a feel for real texts, vowel quantity and meter. They are usually at a desk with a physical keyboard, between or alongside set reading. Typing is how they practise, and speed is a side effect.

## Product Purpose

LatinType teaches the sound and structure of Latin by having students type and read real Latin verse and prose with vowel quantities and scansion shown. Success is a student who reads a line with more confidence in its quantities and meter after working through it.

## Positioning

A typing test can be pointed at any text. LatinType shows the scansion over the exact line being typed, then lets a student read, parse, colour and annotate the same passage and export it.

## Operating Context

- Students choose an author, work, piece and line range from the classical corpus, then type or read.
- Typing modes: Zen, Passage, Time Attack and Daily Challenge.
- Read mode offers scansion, part-of-speech colouring, annotation with pen and highlighter, a dictionary lookup (Whitaker's Words), and PDF and LaTeX export.
- Students will often bring exported passages to class or into their own notes.

## Capabilities and Constraints

- Static React and Vite site deployed to GitHub Pages at latintype.com, with no backend.
- No accounts and no logging in. Scores save automatically to the student's own browser and are never shared, so there are no public leaderboards.
- No progression systems: no XP, levels, titles, badges, unlockable cosmetics, crowns, Elo, ranked play, win/loss records, or races against other players or ghosts.
- Macrons and scansion marks must render accurately in every typeface offered, and letterforms must keep Latin vowels distinct, especially a and o.
- Interface text must stay in one monospaced face so the ASCII art lines up. Only the Latin text changes with the font setting.

## Brand Commitments

- The name LatinType, written `latintype`.
- A terminal and ASCII aesthetic, requested by the owner.
- No rounded-corner cards. Layouts are flat and divided by space and rules, with square corners and no shadows.
- The palette must be comfortable for long sessions: no saturated full-screen grounds and no bright yellow or ochre.

## Evidence on Hand

- Corpus of 21 Latin authors in `public/library/`.
- Whitaker's Words dictionary data in `public/whitakers/`.
- Live leaderboards with a handful of players. There are no testimonials, classroom adopters or learning outcomes, and none may be claimed.

## Product Principles

1. The Latin comes first. Text and scansion outrank every control on the screen.
2. Teach through the text. Features earn their place by helping a student read Latin better, not by rewarding visits.
3. Start immediately. No sign-up, prompt or setup stands between arriving and typing.
4. Be accurate. A wrong quantity or an ambiguous letterform is a bug, not a style choice.

## Accessibility & Inclusion

WCAG AA contrast for all reading and typing text, full keyboard operation, and support for reduced motion. OpenDyslexic stays available as a typeface option.

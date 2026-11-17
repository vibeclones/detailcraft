# Where DetailCraft's code comes from

DetailCraft is our own code, under the Apache License 2.0. We do not copy code from other projects. Where one of our files
follows another project's published algorithm closely, its SPDX line names both licenses and THIRD_PARTY.md credits
it. The libraries DetailCraft uses are listed, with their licenses, in THIRD_PARTY.md; all of them are permissive.

## How copyleft tools are used

Some programs under the GPL, LGPL or MPL are useful references: they read the same file formats. We use them **only
as black boxes in our tests**: we run them on files and compare what they report with what our code reads or
writes. They are never shipped in this repository or in any edition, never linked into the app, and their source
code is never read or copied. When the specification is wrong or silent, the answer is found by experiment on real
files and written down in a comment ("Spec gap: …").

## Our engines

### IFC (cc-ifc, `ifc/`)

Our own IFC engine, written from ISO 10303-21 (STEP physical files) and the buildingSMART IFC2X3, IFC4 and IFC4X3
schemas. web-ifc (MPL-2.0) is used only as a test oracle (counts, bounding boxes, volumes), never shipped.

### DSTV NC

Written from the DSTV NC standard. Two independent readers check the output in the tests, as black boxes. Check
every file in your shop's own viewer before cutting.

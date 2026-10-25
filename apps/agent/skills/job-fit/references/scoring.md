# Fit scoring

The service compares each extracted requirement with literal resume evidence. Evidence-free requirements score zero. Technical, experience, behavioral and career dimensions have weights of 0.30, 0.25, 0.15 and 0.30. A dimension not stated in the JD is reported conservatively rather than guessed. The result is a document match estimate, not a prediction of an offer.

A clear explicit location conflict caps the match band at poor while preserving the visible score. Keyword coverage is checked in code against the resume text and never accepted solely from a model's claim.

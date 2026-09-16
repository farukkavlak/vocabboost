"""Download the NLTK data the scripts need. Run once."""

import nltk

for package in ["wordnet", "omw-1.4", "punkt_tab", "averaged_perceptron_tagger_eng"]:
    nltk.download(package, quiet=True)
    print(f"ok  {package}")

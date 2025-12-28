# Kanji SVG Files

Ce dossier contient les fichiers SVG de stroke order (ordre de tracé) des kanji, provenant du dataset KanjiVG.

## Format de nommage

Les fichiers doivent être nommés selon le code Unicode du kanji :
- Format : u{codeUnicodeHex}.svg
- Exemple : u98df.svg pour le kanji "食" (Unicode U+98DF)

## Comment obtenir les SVG

### Option 1 : Télécharger depuis KanjiVG (recommandé)

1. Visitez le dépôt KanjiVG : https://github.com/KanjiVG/kanjivg
2. Téléchargez les fichiers SVG depuis le dossier kanji/
3. Placez-les dans ce dossier (/apps/web/public/kanji/)

### Option 2 : Télécharger le dataset complet

Le dataset KanjiVG complet contient environ 12,000 kanji. Vous pouvez :
- Cloner le dépôt : git clone https://github.com/KanjiVG/kanjivg.git
- Copier les fichiers du dossier kanjivg/kanji/ vers ce dossier

### Option 3 : Télécharger des kanji spécifiques

Pour les kanji que vous utilisez dans votre application, vous pouvez télécharger uniquement les fichiers nécessaires depuis :
- https://raw.githubusercontent.com/KanjiVG/kanjivg/master/kanji/{codeUnicode}.svg

Exemple pour "四" (u56db) :
- https://raw.githubusercontent.com/KanjiVG/kanjivg/master/kanji/056db.svg

Note importante : Dans KanjiVG, les fichiers sont nommés avec des zéros de remplissage (ex: 056db.svg), mais notre application attend le format u56db.svg. Vous devrez renommer les fichiers après téléchargement.

## Structure attendue

/public/kanji/
├── u4e00.svg  (一 - ichi)
├── u4e03.svg  (七 - nana)
├── u4e09.svg  (三 - san)
├── u4eca.svg  (今 - ima)
├── u56db.svg  (四 - yon)
├── u6669.svg  (時 - toki)
└── ...

## Note

Si un SVG n'est pas disponible, l'application affichera le kanji en texte avec un message indiquant que le SVG n'est pas disponible. Les fonctionnalités d'animation et de numérotation des traits ne seront pas disponibles sans les fichiers SVG.

/**
 * Tessera — i18n
 * Two string tables: page strings (what visitors see, follows settings.lang)
 * and editor strings (follows the browser language).
 * Add a language by adding a key to both tables.
 */
window.Tessera = window.Tessera || {};
(function (T) {
  'use strict';

  const PAGE = {
    en: {
      addToCal: 'Add to calendar', tickets: 'Tickets', subscribe: 'Subscribe', send: 'Send',
      emailPh: 'you@example.com', messagePh: 'Your message…', days: 'days to go', day: 'day to go',
      left: 'to go', done: 'It’s here', topic: 'Topic', tracks: 'tracks', play: 'Play'
    },
    fr: {
      addToCal: 'Ajouter au calendrier', tickets: 'Billets', subscribe: 'S’abonner', send: 'Envoyer',
      emailPh: 'vous@exemple.com', messagePh: 'Votre message…', days: 'jours restants', day: 'jour restant',
      left: 'restant', done: 'C’est le jour J', topic: 'Sujet', tracks: 'titres', play: 'Lecture'
    }
  };

  const EDITOR = {
    en: {
      add: 'Add', settings: 'Profile & theme', export: 'Export', import: 'Import', reset: 'Reset',
      confirm: 'Sure? Click again', done: 'Done', addWidget: 'Add a widget', size: 'Size', tone: 'Style',
      tone_default: 'Card', tone_accent: 'Accent', tone_dark: 'Inverted', tone_ghost: 'Transparent',
      moveUp: 'Up', moveDown: 'Down', duplicate: 'Duplicate', delete: 'Delete', fullWidth: 'Full width (thin)',
      draftRestored: 'Local draft restored', exported: 'page.json downloaded — commit it to publish',
      copied: 'JSON copied to clipboard', imported: 'page.json imported', importError: 'Invalid page.json',
      resetDone: 'Back to the published version', undone: 'Undone', deleted: 'Deleted — ⌘/Ctrl+Z to undo',
      profile: 'Profile', theme: 'Theme', page: 'Page', publish: 'Publish', copy: 'Copy JSON',
      hint: 'Edits are saved in this browser only. Export page.json, commit it to your repo, and your CI rebuilds the site.',
      editHint: 'Drag cards to reorder · click to edit · drop photos anywhere', yes: 'Yes', no: 'No',
      save: 'Save', saved: 'Saved to', saveError: 'Save failed', publishNow: 'Publish', publishing: 'Publishing…',
      publishedOk: 'Published', publishError: 'Publish failed', pick: 'Choose', addImages: 'Add images',
      uploading: 'Processing image…', added: 'Image added', localMode: 'Local mode: Save writes your page and photos straight into the project folder. Commit them with git.',
      provider: 'Provider', apiUrl: 'API URL', repo: 'Repository (owner/name)', branch: 'Branch', pagePath: 'Page file in the repo',
      token: 'Access token', tokenHelp: 'Fine-grained token for this repo only, “Contents: read & write”. Kept in this browser, never in page.json.',
      remember: 'Remember token on this device', pendingImgs: 'images waiting to be published', publishSetup: 'Set up publishing first'
    },
    fr: {
      add: 'Ajouter', settings: 'Profil & thème', export: 'Exporter', import: 'Importer', reset: 'Réinitialiser',
      confirm: 'Sûr ? Re-cliquer', done: 'Terminer', addWidget: 'Ajouter un widget', size: 'Taille', tone: 'Style',
      tone_default: 'Carte', tone_accent: 'Accent', tone_dark: 'Inversé', tone_ghost: 'Transparent',
      moveUp: 'Monter', moveDown: 'Descendre', duplicate: 'Dupliquer', delete: 'Supprimer', fullWidth: 'Pleine largeur (fine)',
      draftRestored: 'Brouillon local restauré', exported: 'page.json téléchargé — commite-le pour publier',
      copied: 'JSON copié', imported: 'page.json importé', importError: 'page.json invalide',
      resetDone: 'Retour à la version publiée', undone: 'Annulé', deleted: 'Supprimé — ⌘/Ctrl+Z pour annuler',
      profile: 'Profil', theme: 'Thème', page: 'Page', publish: 'Publier', copy: 'Copier le JSON',
      hint: 'Les modifications sont gardées dans ce navigateur. Exporte page.json, commite-le dans ton repo, et la CI reconstruit le site.',
      editHint: 'Glisse les cartes pour réordonner · clique pour éditer · dépose des photos n’importe où', yes: 'Oui', no: 'Non',
      save: 'Enregistrer', saved: 'Enregistré dans', saveError: 'Échec de l’enregistrement', publishNow: 'Publier', publishing: 'Publication…',
      publishedOk: 'Publié', publishError: 'Échec de la publication', pick: 'Choisir', addImages: 'Ajouter des images',
      uploading: 'Traitement de l’image…', added: 'Image ajoutée', localMode: 'Mode local : Enregistrer écrit ta page et tes photos directement dans le dossier du projet. Commite-les avec git.',
      provider: 'Fournisseur', apiUrl: 'URL de l’API', repo: 'Dépôt (owner/nom)', branch: 'Branche', pagePath: 'Fichier de la page dans le dépôt',
      token: 'Jeton d’accès', tokenHelp: 'Jeton à portée limitée à ce dépôt, « Contents : lecture & écriture ». Gardé dans ce navigateur, jamais dans page.json.',
      remember: 'Mémoriser le jeton sur cet appareil', pendingImgs: 'images en attente de publication', publishSetup: 'Configure d’abord la publication'
    }
  };

  T.pageLang = 'en';
  T.uiLang = 'en';

  /** Page string (visitor-facing). */
  T.tp = (k) => (PAGE[T.pageLang] || PAGE.en)[k] ?? PAGE.en[k] ?? k;
  /** Editor string. */
  T.te = (k) => (EDITOR[T.uiLang] || EDITOR.en)[k] ?? EDITOR.en[k] ?? k;
  /** Inline bilingual label: "English|Français" (use "||" when the text itself contains "|"). */
  T.L = (s) => {
    s = String(s);
    const [en, fr] = s.split(s.includes('||') ? '||' : '|');
    return T.uiLang === 'fr' && fr ? fr : en;
  };
})(window.Tessera);

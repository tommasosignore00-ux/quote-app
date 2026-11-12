/**
 * Real photos, screenshots and documents for the landing.
 *
 * Every slot starts empty (`src: undefined`): the page then shows the example mockup
 * or the dashed "Foto in arrivo" frame. To use the real file, put it in
 * web/public/landing/ with the name in `file`, then set `src` to that same path.
 * The aspect ratio is reserved either way, so nothing jumps when the image loads.
 */
export interface MediaSlot {
  /** Expected path once the file is added to web/public/landing/. */
  file: string;
  /** Set to `file` once the real image exists. */
  src?: string;
  alt: string;
  /** Width/height, e.g. '3/2'. */
  ratio: string;
  /** Ratio on phones, when different. */
  mobileRatio?: string;
  /** Caption of the dashed frame while the photo is missing. */
  caption?: string;
}

const defineSlots = <K extends string>(slots: Record<K, MediaSlot>) => slots;

export const MEDIA = defineSlots({
  heroScreen: {
    file: '/landing/hero-dettatura.png',
    alt: "Schermata dell'app Mastrovoce: la frase detta e la riga di preventivo con il prezzo preso dal listino",
    ratio: '9/16',
  },
  heroPdf: {
    file: '/landing/hero-preventivo.png',
    alt: "Prima pagina di un preventivo per una pensilina in ferro, con logo e intestazione dell'officina",
    ratio: '210/297',
  },
  seraPrima: {
    file: '/landing/sera-tavolo-prima.jpg',
    alt: 'Tavolo di cucina la sera, sotto una lampada: foglio a quadretti con misure scritte a mano, listino del fornitore stampato, calcolatrice e telefono a faccia in giù',
    ratio: '3/2',
    mobileRatio: '4/5',
    caption:
      'Foto in arrivo: il tavolo di cucina alle 21:40, foglio di misure, listino stampato, calcolatrice.',
  },
  listino: {
    file: '/landing/listino-caricamento.png',
    alt: 'Schermata di caricamento del listino con le prime righe di articoli e prezzi',
    ratio: '4/3',
  },
  manoMicrofono: {
    file: '/landing/mano-guanto-microfono.jpg',
    alt: 'Mano con guanto da lavoro che tocca il pulsante arancione del microfono sullo schermo del telefono, in officina',
    ratio: '4/5',
    caption:
      'Foto in arrivo: una mano con il guanto da lavoro che tocca il microfono, in officina.',
  },
  schermataMicrofono: {
    file: '/landing/schermata-microfono.png',
    alt: "Schermata principale dell'app con il grande pulsante arancione del microfono e la scritta Tocca e di' cosa aggiungere",
    ratio: '9/16',
  },
  conferma: {
    file: '/landing/conferma-voci.png',
    alt: 'Schermata di conferma: la frase detta e tre righe di preventivo con quantità e prezzo dal listino, pronte da aggiungere',
    ratio: '9/16',
  },
  avvisoScelta: {
    file: '/landing/avviso-scelta.png',
    alt: "Avviso dell'app che chiede di scegliere tra due tubolari da 80",
    ratio: '4/3',
  },
  modelloWord: {
    file: '/landing/modello-word.png',
    alt: "Preventivo fatto in Word da un'officina, con i dati del cliente coperti",
    ratio: '210/297',
  },
  preventivoMastrovoce: {
    file: '/landing/preventivo-mastrovoce.png',
    alt: 'Lo stesso preventivo fatto con Mastrovoce: stesso logo e stessa impaginazione, con le righe della pensilina in ferro',
    ratio: '210/297',
  },
  clientePrima: {
    file: '/landing/cliente-prima.png',
    alt: 'Pagina del preventivo vista dal cliente, con il campo nome e cognome e i pulsanti per accettare o rifiutare',
    ratio: '9/16',
  },
  clienteDopo: {
    file: '/landing/cliente-dopo.png',
    alt: "Pagina del preventivo dopo l'accettazione: messaggio con il nome del cliente e la data",
    ratio: '9/16',
  },
  clienteFoto: {
    file: '/landing/cliente-telefono-casa.jpg',
    alt: 'Mano di un cliente che tiene il telefono con la pagina del preventivo e il pulsante per accettare, in una cucina',
    ratio: '4/5',
    caption:
      'Foto in arrivo: il telefono del cliente, a casa, sulla pagina del preventivo.',
  },
  preventiviAccettati: {
    file: '/landing/preventivi-accettati.png',
    alt: "Schermata Preventivi dell'app con la scheda Accettati aperta",
    ratio: '9/16',
  },
  seraDopo: {
    file: '/landing/sera-tavolo-dopo.jpg',
    alt: 'Lo stesso tavolo di cucina, sgombro, con solo il telefono acceso sulla lista dei preventivi accettati',
    ratio: '3/2',
    mobileRatio: '4/5',
    caption:
      'Foto in arrivo: lo stesso tavolo, sgombro, con il telefono sulla schermata Preventivi.',
  },
});

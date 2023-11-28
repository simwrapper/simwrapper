const i18n = {
  messages: {
    en: {

    //Folder Browser
    maps: 'Maps',
    images: 'Images',
    analysis: 'Analysis',
    browserDescription: "This browser can access local folders",
    label: "Label",
    note: "Note",

    //Folders-Data-Files
    files: 'Files',
    selectFile: "Select File...",

    folders: 'Folders',
    localFolder: "Local Folder",
    localFolders: "Local Folders",    
    openFolder: "Open Folder...",
    addFolder:"Add local folder...",
    
    addData: "Add data source...",    
    dataSources: "Data Sources",
    browseSources: "Browse data sources",
    editSources: "Edit data sources...",
    addDataURL: "Add Data URL",

    datset: "Dataset",
    

    //General
    back: 'Go back',
    close: 'Close panel',

    no: "No",
    yes: "Yes",

    theme: 'Theme',
    dark: "dark",
    light: "light",

    cancel: "Cancel",
    settings: "Settings",
    translate: 'Note: German translations are incomplete, but steadily improving',
    language: 'Language',
    
    hideInfo: "Hide Info",
    showInfo: "Show Info",

    restore: "Restore",
    enlarge: "Enlarge",

    favorite: "Favorite",
     
    noIssues: "No issues for this page.",
    clearMessages: "Clear all messages.",

    loading: "Loading...",
    select: "Select",
    add: "Add",

    config: "Config",
    saveYAML: "Save YAML config",
    screenshot: "Take screenshot",
    export: "Export",
    toBeAdded: "To be added",

    //Site Layout
    topsheet: 'Topsheet',
    splitView: "Split View",
    dragFolder: "Drag a Folder from here to the main window area to open side-by-side.",
    chromeEdge: "Chrome & Edge can browse folders directly:",

    
    pinned: "Pinned",
    documentation: "Documentation",
    documentationLink: "Documentation site",
    start: "Getting started",
    news: "News & Updates",
    privacy: "SimWrapper is a client-side app, which means there is no upstream server collecting or storing data.\n\nSimWrapper does not collect, handle or process any data about you while you use the site. SimWrapper does not contain any tracking devices or analytics software. No user cookies are stored or transmitted.",
    tagLine: 'The simulation browser and data visualizer from TUBerlin.',
    fundingPartners: "Funding Partners",
    funding: "Funded by TU Berlin, the German Bundesministerium für Bildung und Forschung, and the ActivitySim Consortium member agencies below.",
    openSource: "SimWrapper is open source and available on",
    moreInfo: "For more information",

    //Chart/Map Layout
    legend: 'Legend:',
    lineWidth: 'Line width:',
    lineWidths: 'Line widths',
    hide: 'Hide smaller than',
    time: 'Time of Day',
    duration: 'Duration',
    circle: 'Centroids',
    showCentroids: 'Show centroids',
    showNumbers: 'Show totals',
    total: 'Totals for',
    origins: 'Origins',
    dest: 'Destinations',

    //Colors
    display: "Display",
    singleColor: "Single color",
    join: "Join by",
    none: "None",
    rowCount:"Row count",
    normalize: "Normalize by",
    addTwoDatasets: "Add two datasets to enable comparisons",
    compareDatasets: "Compare datasets",
    flip: "Flip",
    steps: "Steps",
    column: "Column",
    reverse: "Reverse",
    scaling: "Scaling",

    //Filters
    activeFilters: "Active Filters",
    addFilter: "Add New Filter",
    

    //Errors
    ambiguousDiff: 'Ambiguous diff, use " - " to separate terms',
    filterNotFound: "Filter key is not 'dataset.column'",
    transformsAfterScaling: "Transforms occur after scaling':'Select a data field first",


  },
    de: {
    //Folder Browser
    maps: 'Karten',
    images: 'Bilder',
    analysis: 'Ergebnisse',
    browserDescription: "Mit diesem Browser können lokale Dateien geladen werden",
    label: "Bezeichnung",
    note: "Anmerkung",

    //Folders-Data-Files
    files: 'Dateien',
    selectFile: "Datei auswählen...",

    folders: 'Ordner',
    localFolder: "Lokaler Ordner",
    localFolders: "Lokale Ordner",
    openFolder: "Ordner öffnen...",
    addFolder:"Lokaler Ordner hinzufügen",
    
    dataSources: "Datenquellen",
    addData: "Datenquelle hinzufügen...",    
    browseSources: "Datenquellen durchsuchen...",
    editSources: "Datenquellen bearbeiten...",
    addDataURL: "URL zu Datenquelle hinzufügen",
    

    //General
    back: 'Zurück',
    close: 'Schließen',

    no: "Nein",
    yes: "Ja",

    theme: 'Design',
    dark: "dunkel",
    light: "hell",

    cancel: "Abbrechen",
    settings: "Einstellungen",
    translate: 'Die Übersetzungen sind unvollständig, werden aber immer besser...',
    language: 'Sprache',

    hideInfo: "weniger Info",
    showInfo: "mehr Info",

    restore: "Verkleinern",
    enlarge: "Vergrößern",

    favorite: "Favorit",

    noIssues: "Keine Probleme auf dieser Seite.",
    clearMessages: "Alle Benachrichtigungen entfernen.",

    loading: "Laden...",
    select: "Auswählen",
    add: "Hinzufügen",

    config: "Konfiguration",
    saveYAML: "YAML Konfiguration speichern",
    screenshot: "Screenshot speichern",
    export: "Exportieren",
    toBeAdded: "Wird hinzugefügt",

    //Site Layout

    topsheet: 'Topsheet',
    splitView: "Geteilte Ansicht",
    dragFolder: "Ziehe einen Ordner von hier in die Hauptansicht, um sie nebeneinander zu öffnen.",
    chromeEdge: "Chrome & Edge können Ordner direkt durchsuchen:",
    
    pinned: "Angeheftet",
    documentation: "Dokumentation",
    documentationLink: "Dokumentation",
    start: "Erste Schritte",
    news: "News & Updates",
    privacy: "SimWrapper ist eine clientseitige Anwendung, d.h. es gibt keinen Upstream-Server, der Daten sammelt oder speichert. SimWrapper sammelt, bearbeitet oder verarbeitet keine Daten über Sie, während Sie die Website nutzen. SimWrapper enthält keine Tracking Devices oder Analysesoftware. Es werden keine Benutzer-Cookies gespeichert oder übertragen.",
    tagLine: 'Der Modellergebnis-Browser der TU Berlin.',
    fundingPartners: "Kooperationspartner",
    funding: "Gefördert durch die TU Berlin, das Bundesministerium für Bildung und Forschung sowie die Mitglieder des ActivitySim Konsortium:",
    openSource: "SimWrapper ist Open Source und downloadbar von",
    moreInfo: 'Für weitere Informationen:',   


    //Chart/Map Layout
    legend: 'Legende:',
    lineWidth: 'Linienstärke:',
    lineWidths: 'Linienstärken',
    hide: 'Ausblenden wenn kleiner als',
    time: 'Uhrzeit',
    duration: 'Dauer',
    circle: 'Zentroiden',
    showCentroids: 'Zentroiden einblenden',
    showNumbers: 'Show totals',
    total: 'Totals for',
    origins: 'Quellen',
    dest: 'Ziele',

    //Colors
    display: "Darstellung",
    singleColor: "Einfarbig",
    join: "Verknüpfen über",
    none: "Keine",
    rowCount:"Anzahl Reihen",
    normalize: "Normalisieren",
    addTwoDatasets: "Zwei Datensets hinzufügen für Vergleiche",
    compareDatasets: "Datensets vergleichen",
    flip: "Umdrehen",
    steps: "Abstufungen",
    column: "Spalte",
    reverse: "Umkehren",
    scaling: "Skalieren",

    //Filters
    activeFilters: "Aktive Filter",
    addFilter: "Neuer Filter hinzufügen",

    //Errors
    ambiguousDiff: 'Ambiguous diff, use " - " to separate terms',
    filterNotFound: "Filter key is not 'dataset.column'",
  
  
  },
  },
}

export default i18n

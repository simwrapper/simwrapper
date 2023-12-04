const i18n = {
  messages: {
    en: {
    //General
    back: 'Go back',
    close: 'Close panel',

    no: "No",
    yes: "Yes",

    here: "here",

    theme: 'Theme',
    dark: "dark",
    light: "light",

    cancel: "Cancel",
    settings: "Settings",
    translate: 'Note: German translations are incomplete, but steadily improving',
    language: 'Language',
    
    hideInfo: "Hide Info",
    showInfo: "Show Info",
    showHide: "Show/Hide",

    restore: "Restore",
    enlarge: "Enlarge",

    favorite: "Favorite",
    
    selection: "Selection",
    select: "Select",
    add: "Add",    
    
    config: "Config",
    saveYAML: "Save YAML config",
    screenshot: "Take screenshot",
    export: "Export",
    toBeAdded: "To be added",

    loginRequired: "Login Required",
    accessRequiresLogin: "access to this site requires a login.",
    username: "Username",
    VSPUsername: "VSP Username",
    password: "Password",   

    number: "Number",
    trips: "Trips",
    count: "Count",
    areas: "Areas",
    map: "Map",    

    metrics: "Metrics",
   
    blank: "Blank...",

    share: "share",
    search: "Search...",    

    noIssues: "No issues for this page.",
    clearMessages: "Clear all messages.",

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
    in: "Zoom in",
    out: "Zoom out",
    center: "North",
    maxHeight: "3D Height",
    showChanges: "Only show changes",
    chart: "chart",

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
    colors: "Colors", 
    
    //Filters
    activeFilters: "Active Filters",
    addFilter: "Add New Filter",

    //Folder Browser
    maps: 'Maps',
    images: 'Images',
    analysis: 'Analysis',
    browserDescription: "This browser can access local folders",
    label: "Label",
    note: "Note",
    dragDrop: "Or Drag and Drop any dataset file:",
    dragDropHere: "Drop files into this area.",
    browse: "browse your files",
    noSizeLimit: "No size limit, but large datasets could crash your browser :-)",
    supportedFileTypes: "Supported file types:",
    processingFiles: "Processing files",
    
    //Video
    videoTag: "Video tag not supported. Download the video",

    //PlugIns
    drtVehicles: "DRT Vehicles",
    agentAnimation: "Agent Animation",
    aggregateOD: "Aggregate OD",
    table: "Table",

    //CarrierViewer
    carriers: 'Carriers',
    vehicles: 'VEHICLES',
    services: 'SERVICES',
    shipments: 'SHIPMENTS',
    tours: 'TOURS',
    pickup: 'Pickup',
    delivery: 'Delivery',
    flatten: 'Simple&nbsp;tours',
    shipmentDots: 'Show shipments',
    scaleSize: 'Widths',
    scaleFactor: 'Width',

    //Flow Map
    animation: "Animation",
    labels: "Labels",
    clustering: "Clustering",

    //Links
    data: "Daten:",
    bandwidths: 'Linienbreiten: 1 pixel =:',
    timeOfDay: 'Time of Day',
    selectColumn:"Select data column",
    showDiffs: "Differences",
    all: "all",
    networkLinks: "Network Links",

    //ModalJoinColumnPicker
    joinDatasets: "join Datasets",
    selectJoinColumn: "Select columns containing matching IDs",

    //ModalIDColumnPicker
    selectIDColumn: "Select column containing IDs",
    uniqueID: "Which property contains the unique ID for each feature?",

    //Modal Dialog Custom Color Breakpoint
    customBreakpoints: "Custom Breakpoints",

    //Event messages
    loading: "Loading...",
    loadingNetwork: "Loading Network...",
    calculatingCoords: "Calculating Coordinates...",
    loadingCSV: "Loading CSV files...",
    creatingDiagram: "Creating diagram...",
    sorting: "Sorting...",
    loadingDatasets: "Loading Datasets...",
    analyzing: "Analyzing...",
    loadingConfig: "Loading Configuration...",
    buildingNodeGraph: "Building node graph...",
    loadingFeatures: "Loading features...",
    calculatingCentroids: "Calculating centroids...",
    loadingShape: "Loading shape file...",
    generateShape: "Generating shape ...",
    projectCoords: "Projecting Coordinates...",
    buildingChart: "Building chart...",
    pleaseWait: "Please wait...",

    //Errors
    ambiguousDiff: 'Ambiguous diff, use " - " to separate terms',
    filterNotFound: "Filter key is not 'dataset.column'",
    transformsAfterScaling: "Transforms occur after scaling':'Select a data field first",


  },
    de: {
    //General
    back: 'Zurück',
    close: 'Schließen',

    no: "Nein",
    yes: "Ja",

    here: "hier",

    theme: 'Design',
    dark: "dunkel",
    light: "hell",

    cancel: "Abbrechen",
    settings: "Einstellungen",
    translate: 'Die Übersetzungen sind unvollständig, werden aber immer besser...',
    language: 'Sprache',

    hideInfo: "weniger Info",
    showInfo: "mehr Info",
    showHide: "Ein-/Ausklappen",

    restore: "Verkleinern",
    enlarge: "Vergrößern",

    favorite: "Favorit",
    
    selection: "Auswahl",
    select: "Auswählen",
    add: "Hinzufügen",

    config: "Konfiguration",
    saveYAML: "YAML Konfiguration speichern",
    screenshot: "Screenshot speichern",
    export: "Exportieren",
    toBeAdded: "Wird hinzugefügt",    

    loginRequired: "Anmeldung erforderlich",
    accessRequiresLogin: "Zugang zu dieser Seite nur für angemeldete Nutzer",
    username: "Benutzername",
    VSPUsername: "VSP Benutzername",
    password: "Passwort",
    
    number: "Zahl",
    trips: "Fahrten",
    count: "Anzahl",
    areas: "Orte",
    map: "Karte",    

    metrics: "Metrics",

    blank: "Leer...",

    share: "teilen",
    search: "Suche...",

    noIssues: "Keine Probleme auf dieser Seite.",
    clearMessages: "Alle Benachrichtigungen entfernen.",


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
    
    datset: "Datensatz",

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
    in: "Vergrößern",
    out: "Verkleinern",
    center: "Norden",
    maxHeight: "3D-Höhe",
    showChanges: "Nur Änderungen zeigen",
    chart: "Diagramm",
    
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
    colors: "Farben",

    //Filters
    activeFilters: "Aktive Filter",
    addFilter: "Neuer Filter hinzufügen",

    //Folder Browser
    maps: 'Karten',
    images: 'Bilder',
    analysis: 'Ergebnisse',
    browserDescription: "Mit diesem Browser können lokale Dateien geladen werden",
    label: "Bezeichnung",
    note: "Anmerkung",
    dragDrop: "Oder eine Datei hier hinziehen:",
    dragDropHere: "Hier Datei hinziehen",
    browse: "Dateien durchsuchen",
    noSizeLimit:"Keine Größenbeschränkung, aber große Dateien können zu Browserabstürzen führen :-)",
    supportedFileTypes: "Unterstützte Dateitypen:",
    processingFiles: "Dateien werden verarbeitet",    

    //Video
    videoTag: "Video-Tag nicht untersützt. Lade das Video runter:",

    //PlugIns
    drtVehicles: "DRT Fahrzeuge",
    agentAnimation: "Agentenanimation",
    aggregateOD: "Quelle-Ziel-Aggregation",
    table: "Tabelle",
    
    //Carrier Viewer
    carriers: 'Unternehmen',
    vehicles: 'FAHRZEUGE',
    services: 'BETRIEBE',
    shipments: 'LIEFERUNGEN',
    tours: 'TOUREN',
    pickup: 'Abholung',
    delivery: 'Lieferung',
    flatten: 'Einfache&nbsp;Touren',
    shipmentDots: 'Zeige Lieferungen',
    scaleSize: 'Linienstärke',
    scaleFactor: 'Skalierung',

    //Flow Map
    animation: "Animation",
    labels: "Beschriftungen",
    clustering: "Clustern",

    //Links
    data: "Daten:",
    bandwidths: 'Linienbreiten: 1 pixel =:',
    timeOfDay: 'Uhrzeit',
    selectColumn:"Datenspalte wählen",
    showDiffs: "Differenzen",
    all: "alle",
    networkLinks: "Netzwerkkanten",

    //ModalJoinColumnPicker
    joinDatasets: "Datensätze verknüpfen",
    selectJoinColumn: "Wähle die Spalten mit den übereinstimmenden IDs",

    //ModalIDColumnPicker
    selectIDColumn: "Spalte mit IDs auswählen",
    uniqueID: "Welches Attribut enthält einmalige IDs? Which property contains the unique ID for each feature?",

    //Modal Dialog Custom Color Breakpoint
    customBreakpoints: "benutzerdefinierte Unterbrechungen",

    //Event Messages
    loading: "Laden...",
    loadingNetwork: "Verkehrsnetz bauarbeiten...",
    calculatingCoords: "Koordinaten berechnen...",
    loadingCSV: "CSV Daten laden...",
    creatingDiagram: "Diagramm erstellen...",
    sorting: "Sortieren...",
    loadingDatasets: "Datensätze laden...",
    analyzing: "Analysieren...",
    loadingConfig: "Konfiguration laden...",
    buildingNodeGraph: "Knotenpunktnetz wird erstellt...",
    loadingFeatures: "Elemente laden...",
    calculatingCentroids: "Zentroiden berechnen...",
    loadingShape: "Shape laden...",
    generateShape: "Shape berechnen...",
    projectCoords: "Koordinaten projizieren...",
    buildingChart: "Diagramm erstellen...",
    pleaseWait: "Bitte warten...",
    
    //Errors
    ambiguousDiff: 'Ambiguous diff, use " - " to separate terms',
    filterNotFound: "Filter key is not 'dataset.column'",
    promptCRS: 'Koordinatensystem, z.B. EPSG: 25832?\n\n Diese Koordinaten haben keine Längen/Breitengrade, entweder zu einem anderen System konvertieren oder in der Kopfzeile "# EPSG:xxxx" hinzufügen'
  
  
  },
  },
}

export default i18n

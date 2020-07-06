const config: any = {
  projects: [
    {
      name: ' Berlin SNZ',
      url: 'snz-berlin',
      description: 'Berlin Szenario (runs-svn)',
      svn: 'https://svn.vsp.tu-berlin.de/repos/runs-svn/avoev/snz-berlin/',
      need_password: true,
    },
    {
      name: 'Shared-SVN',
      url: 'shared-svn',
      description: 'Test svn access (shared-svn)',
      svn: 'https://svn.vsp.tu-berlin.de/repos/shared-svn/projects/',
      need_password: true,
    },
    {
      name: 'Localhost:8000',
      url: 'local',
      description:
        "Verwenden Sie 'scripts/serve.py', um auf lokale Dateien ohne Server zuzugreifen.",
      svn: 'http://localhost:8000',
      need_password: true,
    },
  ],
}

export default config

const config: any = {
  projects: [
    {
      name: 'EpiSim batteries',
      url: 'episim',
      description: 'MATSIM-Episim model runs for COVID-19',
      svn:
        'https://svn.vsp.tu-berlin.de/repos/public-svn/matsim/scenarios/countries/de/episim/battery/',
      need_password: false,
    },
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
      name: 'Apache Localhost:8000',
      url: 'apache',
      description: 'For serving local files without any server',
      svn: 'http://localhost:8000',
      need_password: true,
    },
  ],
}

export default config

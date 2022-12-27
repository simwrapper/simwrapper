---
id: guide-project-sites
title: 3. Building a project site
---

You can hide all of the SimWrapper "chrome" such as the folder browser, and provide custom header/footer for each page using CSS. This is useful for building special-purpose tools that might be outward-facing, for example.

## Setting up a project site

- Create `simwrapper-config.yaml` in your project folder
- Define the custom footer and header in markdown files
- Use css in a custom CSS file to present as you wish

There are two general configuration options:

**hideLeftBar:** True/false, hides the left-side folder browser panel

**fullWidth:** True/false, true removes the fixed-width centered panel if you want a full-screen experience

#### Sample simwrapper-config.yaml file

```yaml
hideLeftBar: true
fullWidth: true
header: header.md
footer_en: footer.md
footer_de: footer.md
css: custom.css
```

#### Sample header.md

```markdown
<!-- header image logo -->
<img class="project-logo"
     src="https://svn.vsp.tu-berlin.de/repos/public-svn/matsim/scenarios/countries/de/kelheim/projects/KelRide/logos/KelRide-text.png"
/>
```

#### Sample footer.md

```markdown
<footer>
<div class="container">
  <div class="logos">
      <img src="https://svn.vsp.tu-berlin.de/repos/public-svn/matsim/scenarios/countries/de/kelheim/projects/KelRide/logos/KelRide-text.png"/>
      <img src="https://svn.vsp.tu-berlin.de/repos/public-svn/matsim/scenarios/countries/de/kelheim/projects/KelRide/logos/LK_Kelheim.png"/>
      <img src="https://svn.vsp.tu-berlin.de/repos/public-svn/matsim/scenarios/countries//de/duesseldorf/projects/komodnext/website/logos/TU.svg"/>
  </div>

  <div class="menu">
    VSP / TU Berlin
    © 2023 TU Berlin. <a href="https://vsp.berlin/impressum">Impressum</a>
  </div>
</div>

</footer>
```

#### Sample custom.css

This CSS is quite extensive!

```css
html {
font-size: 16px !important;
}

h2 {
font-size: 2rem;
}

#dashboard {
width: 80%;
margin: auto;
}

.up-link {
display: none;
}

.tabs ul li:last-child {
display: none;
}

.tabs.is-centered ul {
justify-content: left !important;
padding-left: 170px;
}

.row-scenarios .dash-card-frame {
margin-bottom: 0 !important;
}

img.project-logo {
position: absolute;
height: 48px;
}

.tabs a {
font-size: 1.4rem;
}

.project-header {
margin: 0 !important;
padding-bottom: 0 !important;
}

.project-footer {
padding: 0 !important;
margin-bottom: 0 !important;
}

footer {
background-color: #262626;
}

.logos img {
height: 45px;
}

footer .logos {
display: flex;
justify-content: left;
gap: 15px;
align-items: center;
padding: 36px 0 24px;
border-bottom: 1px solid #4b4b4b;
margin-bottom: 24px;
}

footer .menu {
display: flex;
align-items: flex-start;
justify-content: space-between;
padding-bottom: 36px;
color: #b2b2b2;
}
```

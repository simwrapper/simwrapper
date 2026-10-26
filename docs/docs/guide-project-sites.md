---
id: guide-project-sites
title: Building a project site
---

You can hide all of the SimWrapper "chrome" such as the folder browser, and provide custom header/footers for each page. This is useful for building special-purpose websites that might be outward-facing, for example.

## Setting up a project site

- Create `simwrapper-config.yaml` in your project folder
- Define the top bar, side bar, and config as shown below
- Define any custom footer and header content in markdown files
- Use css in a custom CSS file to modify look

## simwrapper-config.yaml

**General configuration options:**

|**Field**|**Description**|**Default**|
|---------|---------------|-----------|
|**hideLeftBar** |  True/false, hides the left-side SimWrapper configuration panels | true |
| **fullWidth** | True/false, use the full window width  | true |
| **theme** | Set to "light" or "dark" if you want to begin with this theme. Note user can always override this with their own config. | unset |
| **header** | Filename containing markdown text to be shown at top of page. Language-specific header can be in header_en or header_de | none |
| **footer** | Filename containing markdown text to be shown at bottom of page. Language-specific footer text can be in footer_en or footer_de | none |
| **css** | Custom CSS for styling. See below. | none |

**topNavBar** - Set logo and links for a top nav bar at the top of the page.

This section defines optional top-left logo and links in the left- and right- sides of the header.

Top-level links can also have one level of drop-down menu children. (Top navbar only)

```yaml
topNavBar:
  logo:
    image: http://mysite.org/images/logo.png # this should be a full URL
    url: https://mysite.org
  left:
    - text: Scenarios
      url: /scenarios
      children:
      - text:  Scenario 1
        url: /scenarios/s1
      - text:  Scenario 2
        url: /scenarios/s2
  right:
    - text: About
      url: /about
    - text: Help
      url: /help
```

**leftNavBar** - Set logo and links for a left-side nav bar

This section defines optional left side links for navigation, in top-, middle- and bottom- sections.

```yaml
leftNavBar:
  top:
    - image: /images/logo.png
      url: /
  middle:
      - text:  Scenario 1
        url: /scenarios/s1
      - text:  Scenario 2
        url: /scenarios/s2
  bottom:
    - text: About
      url: /about
    - text: Help
      url: /help
```
### Example simwrapper-config.yaml

Putting it all together:

```yaml
hideFilesSection: true
fullWidth: true
theme: dark
header: header.md
footer: footer.md
footer_en: footer.md
footer_de: footer.md
css: custom.css
topNavBar:
  logo:
    image: http://localhost:8000/viz-tests/project-site/dfg.jpg
  left:
    - text: Hello
      children:
        - text: hello2
    - text: Fingers
      url: /images/dfg.jpg
  right:
    - text: Hello
      url: /images/dfg.jpg
    - text: Fingers
      url: /images/dfg.jpg
leftNavBar:
  top:
    - image: http://localhost:8000/viz-tests/project-site/dfg.jpg
  middle:
    - text: Scenario 1
      url: /scenarios/s1
    - text: Scenario 2
      url: /scenarios/s2
  bottom:
    - text: About
      url: /about
    - text: Help
      url: /help
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
    © 2025 TU Berlin. <a href="https://vsp.berlin/impressum">Impressum</a>
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

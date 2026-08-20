# Pug template quickstart

Pug is an HTML Template language that makes HTML much easier to read and write, once you've gotten used to the syntax. Like Python, Pug uses **indentation** to define blocks and parent/child relationships, which is super important in HTML! This readme should get you started in understanding how SimWrapper uses Pug in all of its `.vue` template files.

## Pug documentation

- Official Pug site is here: https://pugjs.org/language/tags.html Good, complete reference. But, you have to click through many pages of reference material on the right-side side bar to get all the necessary pieces which is why I wrote this doc.
- https://www.geeksforgeeks.org/node-js/pug-view-engine-introduction/ also has some intro material.

## HTML Tags and content: h1,h2,p,a, etc

HTML tags are just written with their names, without any of the `<usual>` `<HTML>` `<brackets>`.

- Since there are no opening brackets, there are also no `</closing>` tags!
- Pug uses **indentation** to group items into parent/child sets, just like Python.
- Text can follow a tag after a single space, and becomes the **content** of that tag

```pug
div
  h1 Chapter 1: My data visualization site
  h2 A personal journey
  p Much longer text could be here, and I could even embed some HTML <b>styling</b>
  div
    span Many levels of indentation are possible
      b &nbsp;and this would all be bold
      | and the pipe `|` tells pug to continue the <span> element from above!
hr
div
  p Perhaps some footer content down below
```

You can also write a multi-line text block by appending a period to the tag:

```pug
p.
  All of this text will
  be part of the paragraph tag that
  is written using `p.` above
```

Note that if you forget the period, Pug will think that the `p` has three child elements, elements called `All`, `be`, and `is`. Those are not valid HTML tags! Oops =)

You can put Vue components directly in a template, they are not limited to standard HTML tags. So if I have defined a component "MyVizComponent" in my code, I can reference that in the template directly in two ways:

```pug
div
  //- camel case works
  MyVizComponent
  //- so does kebab-case!
  my-viz-component
  //- and yes these are comment strings, ignored
```

## Tag properties: \<div class="my-footer" style="margin-top: 1rem">

Any tag can have properties embedded using parenthesis, e.g. `img(src="/chipmunk.png" width=50)`

- The opening paren MUST be **directly touching** the end of the tag name. No spaces!
  - `div(...)` works,
  - `div (...)` does not!!!
- You can write multi-line elements this way, just be sure to close the parentheses after all the properties
- AFTER the close parenthesis, you can add text the same was as above, by continuing the line after a single space
- E.g. the final div below contains an image and a link. For the `a` link, the text of the link is "Go Back Home" and clicking will go to `/`
- Pay attention to that close-parenthesis! it divides the set of tag properties from any text content in the element.

```pug
p(class="my-header" style="font-size: 2rem") This will be huge

//- everything on one line:
div(class="datasets" style="color:gray" multiline="true")

//- or multiline with a closing paren, identical:
div(class="datasets"
  style="color: gray"
  multiline="true"
) Some content here
  img(src="/fancy.jpg" width=100 title="tooltip text")
  a(href="/") Go Back Home
```

## Two helpful special cases: id="..." and class="..."

Because divs are so common and they are often identified with "id" and "class" properties, pug provides a special shorter syntax for them.

- Any element can have an id by appending `#my-id` to the element.
- If an element **starts** with a `#`, it becomes a div with that id.
  - `h2#section1  ---> \<h2 id="section1">`
  - `#my-item  ---> \<div id="my-item">`
- Any element can have class names appended to it using a period `.`
- If an element **starts** with a period, it becomes a div with that list of classes.
  - `button.btn-cancel.large ---> <button class="btn-cancel large">`
  - `.hintbox.small ---> <div class="hintbox small">`
- These can be combined: use periods to separate classnames from id and each other

```pug
#section-one(hint="a div with id='section-one'")
  p.softstyle Some text here, this p has class="softstyle"
  .items.brightstyle(width=10 hint="a div with class='items brightstyle'")
  .items.softstyle(width=10 hint="a div with class='items softstyle'")

#section-two.extra.config(hint="a div with id='section-two' and class='extra config'")
  .items More items here
```

Pay attention to the indentation: elements that begin with "." might look like they are indented when they are not!

## Vue extensions: how Vue uses Pug for variables, loops, etc

Vue inserts many things into its templates, whether they be HTML or Pug or whatever. Mostly we pass variables into text strings, send parameters to child Vue components, listen for events, and loop. Let's look at those now.

### Text replacements

Any text/content area can have areas surrounded by `{{ double-braces }}`. What's inside of the braces will be interpreted and must be valid TypeScript, and will be inserted into the template.

- Pretty much any valid TypeScript expression can be embedded, even string replacements
- No need for `this.` in the expression -- Vue adds that if needed.

```pug
p Total number of riders: {{ numRiders }}
.item {{ `Total number of trips: ${numRiders*2} also works`}}
```

### Sending variables and objects to components

Vue has a special syntax for passing Javascript into component properties using the `:colon` syntax. When a property name is prefixed with a colon, the value of the Javascript expression will be passed instead of the raw text:

```pug
my-component.extra.pretty(
  hint="This is just raw text"
  :riders="numRiders"
  :options="configOptions"
  :otherHint="`More text from ${owner} is at ${link}`"
)
```

Some notes:

- You don't need the `{{ brackets }}` in parameters; the colon prefix in the parameter name tells Vue that you want to evaluate it.
- So "hint" above is just a plain string passed to the component as a simple property, while "riders" and "options" are JavaScript variables or objects that are passed in.
- "otherHint" above evaluates the string replacement first and then passes it to the component.

This will definitely "gotcha" a few times: forgetting a colon or adding one when you don't need it is a common source of Vue bugs. The code linter in your IDE will catch most of these for you.

### Event listeners

This one is easy, you just prepend an `@` to the event name and it will fire when the event of that name is emitted. Put the name of a method in the quotes and that method will receive the event directly.

You can also write code and/or use the variable `$event` if you want to handle it directly in the template instead of calling a separate function.

```pug
button(@click="handleClickEvent") Submit

button.my-cancel-button(@click="handleCancel") Cancel

button.my-toggle-button(@click="isToggleOn = !isToggleOn") Flip

my-component.notify-area(
  :options="configOptions"
  @notify="handleNotify($event,true)"
  @close="closeApp(false)"
)

```

### Vue Loops

Many times we want to have multiple elements based on an array we have in our code. Vue has a special `v-for` for this which is easy to use:

- `v-for` to set up the loop itself, give the loop element a name so you can refer to it (e.g. "route" below)
- You can also get the index if needed with `v-for="route,i in routes"`

```pug
.route-list
  .route(v-for="route in allRoutes")
    .route-name {{ route.name }}
    .route-riders {{ route.totalRiders }}

  .lines(v-for="line,i in allLines")
    .line-label Line Number {{ i+1 }}
    .line-name Line name: {{ line.name }}
```

## And that's really all there is to it.

Once you have this down, you'll be able to read the Pug templates. Start with some of the smaller helper classes -- some of our Viz plugins are quite enormous and should probably be broken up into smaller sections (yes, that's possible with Vue!)

So, hopefully that's enough to get you started. Have fun! ..b

const siteConfig = {
  title: "aftersim", // Title for your website.
  tagline: "The transport simulation visualizer from TU Berlin",
  url: "https://aftersim.github.io", // Your website URL
  baseUrl: "/docs/", // Base URL for your project */
  projectName: "aftersim.github.io",
  organizationName: "aftersim",
  headerLinks: [
    { doc: "aftersim-intro", label: "Documentation" },
    { blog: true, label: "Blog", left: true },
    {
      href: "https://github.com/aftersim/aftersim",
      label: "Github",
      external: true,
    },
  ],

  /* path to images for header/footer */
  headerIcon: "img/aftersim-logo.png",
  footerIcon: "img/vsp-logo-300dpi.png",
  favicon: "img/aftersim-logo-64.png",

  /* Colors for website */
  colors: {
    // primaryColor: "#298653",
    // secondaryColor: "#285555",
    primaryColor: "#43407E",
    secondaryColor: "#514E9A",
  },

  stylesheets: [
    "https://fonts.googleapis.com/css?family=Roboto:400,400i,700|Roboto+Slab:400,400i,700",
  ],

  highlight: { theme: "default" },

  scripts: [], // "https://buttons.github.io/buttons.js"],

  cleanUrl: true,
  copyright: `Copyright © ${new Date().getFullYear()} VSP, TU Berlin`,
  enableUpdateTime: true,
  onPageNav: "separate",

  // Open Graph and Twitter card images.
  ogImage: "img/undraw_online.svg",
  //  twitterImage: "img/undraw_tweetstorm.svg",
  //  twitterUsername: "billyinberlin",
  // For sites with a sizable amount of content, set collapsible to true.
  // Expand/collapse the links and subcategories under categories.
  // docsSideNavCollapsible: true,

  // Show documentation's last contributor's name.
  // enableUpdateBy: true,

  // You may provide arbitrary config keys to be used as needed by your
  // template. For example, if you need your repo's URL...
  // repoUrl: 'https://github.com/facebook/test-site',
};

// List of projects/orgs using your project for the users page.
const users = [];
//   {
//     caption: "User1",
//     // You will need to prepend the image path with your baseUrl
//     // if it is not '/', like: '/test-site/img/image.jpg'.
//     image: "/img/undraw_open_source.svg",
//     infoLink: "https://www.facebook.com",
//     pinned: true,
//   },
// ];

module.exports = siteConfig;

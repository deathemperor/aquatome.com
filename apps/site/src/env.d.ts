declare namespace App {
  interface Locals {
    /** This page in each language that has it (absolute URLs), set by Base for the header's language menu. */
    langs?: (readonly [import('./lib/i18n').Lang, string])[]
  }
}

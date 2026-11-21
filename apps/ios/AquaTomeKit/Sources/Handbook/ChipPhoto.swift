extension HandbookShelves.ChipShelf {
  /// The page whose photo the chip shows, as the site names it (`imgOf`). The chip's page names and links that fish (the
  /// chief, 15 Nov), so the chip shows its photo only with it: never a photo whose fish it can't name.
  public var photoOf: HandbookIndex.Item? { chip.img == nil ? nil : pages.first { $0.contentId == chip.imgOf } }
}

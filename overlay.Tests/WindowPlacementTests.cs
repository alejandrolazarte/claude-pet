using System.Windows;
using Shouldly;
using Xunit;

namespace PetOverlay.Tests;

public class WindowPlacementTests
{
    private static readonly Rect WorkArea = new(0, 0, 1920, 1032);
    private static readonly Rect Screen = new(0, 0, 3456, 1145);
    private static readonly Size Window = new(96, 100);
    private static readonly Point Corner = new(1800, 908);

    [Fact]
    public void For_starts_in_the_bottom_right_corner_when_nothing_was_saved()
    {
        // Act
        var placement = WindowPlacement.For(WorkArea, Screen, Window, null);

        // Assert
        placement.ShouldBe((Corner, (Point?)null));
    }

    [Fact]
    public void For_starts_in_the_bottom_right_corner_when_the_saved_spot_is_off_the_screens()
    {
        // Arrange
        const string saved = """{"left":-86,"top":339,"anchorX":4,"anchorY":254}""";

        // Act
        var placement = WindowPlacement.For(WorkArea, Screen, Window, saved);

        // Assert
        placement.ShouldBe((Corner, (Point?)null));
    }

    [Fact]
    public void For_restores_the_saved_spot_and_where_the_character_was_in_it()
    {
        // Arrange
        const string saved = """{"left":1500,"top":300,"anchorX":4,"anchorY":254}""";

        // Act
        var placement = WindowPlacement.For(WorkArea, Screen, Window, saved);

        // Assert
        placement.ShouldBe((new Point(1500, 300), (Point?)new Point(4, 254)));
    }

    [Fact]
    public void For_restores_a_saved_spot_without_anchor_and_leaves_it_to_the_first_size()
    {
        // Arrange
        const string saved = """{"left":1500,"top":300}""";

        // Act
        var placement = WindowPlacement.For(WorkArea, Screen, Window, saved);

        // Assert
        placement.ShouldBe((new Point(1500, 300), (Point?)null));
    }

    [Fact]
    public void For_falls_back_to_the_corner_when_the_saved_file_is_broken()
    {
        // Arrange
        const string saved = "{not json";

        // Act
        var placement = WindowPlacement.For(WorkArea, Screen, Window, saved);

        // Assert
        placement.ShouldBe((Corner, (Point?)null));
    }

    [Fact]
    public void Inside_pulls_back_a_window_the_bubble_and_a_big_character_pushed_past_the_bottom_right()
    {
        // Act
        var position = WindowPlacement.Inside(WorkArea, Corner, new Size(268, 565));

        // Assert
        position.ShouldBe(new Point(1652, 467));
    }

    [Fact]
    public void Inside_leaves_a_window_that_fits_where_it_is()
    {
        // Act
        var position = WindowPlacement.Inside(WorkArea, new Point(1500, 300), new Size(268, 565));

        // Assert
        position.ShouldBe(new Point(1500, 300));
    }

    [Fact]
    public void Inside_pulls_back_a_window_past_the_top_left()
    {
        // Act
        var position = WindowPlacement.Inside(WorkArea, new Point(-40, -12), new Size(268, 565));

        // Assert
        position.ShouldBe(new Point(0, 0));
    }

    [Fact]
    public void Inside_keeps_a_window_on_the_second_monitor_within_that_monitor()
    {
        // Arrange
        var secondMonitor = new Rect(1920, 185, 1536, 912);

        // Act
        var position = WindowPlacement.Inside(secondMonitor, new Point(3300, 900), new Size(268, 565));

        // Assert
        position.ShouldBe(new Point(3188, 532));
    }

    [Fact]
    public void Inside_shows_the_top_left_of_a_window_taller_than_the_work_area()
    {
        // Act
        var position = WindowPlacement.Inside(WorkArea, new Point(1500, 300), new Size(268, 1200));

        // Assert
        position.ShouldBe(new Point(1500, 0));
    }
}

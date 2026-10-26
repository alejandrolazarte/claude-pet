using System.Windows;
using Shouldly;
using Xunit;

namespace PetOverlay.Tests;

public class PetAnchorTests
{
    private static readonly Point Window = new(1500, 700);

    [Fact]
    public void WindowPositionFor_keeps_the_window_where_it_is_before_the_first_size()
    {
        PetAnchor.WindowPositionFor(Window, null, new Point(30, 4)).ShouldBe(Window);
    }

    [Fact]
    public void WindowPositionFor_moves_the_window_up_and_left_by_what_the_bubble_pushed_the_character()
    {
        PetAnchor.WindowPositionFor(Window, new Point(30, 4), new Point(84, 132)).ShouldBe(new Point(1446, 572));
    }

    [Fact]
    public void WindowPositionFor_puts_the_window_back_once_the_bubble_is_gone()
    {
        var withBubble = PetAnchor.WindowPositionFor(Window, new Point(30, 4), new Point(84, 132));

        PetAnchor.WindowPositionFor(withBubble, new Point(84, 132), new Point(30, 4)).ShouldBe(Window);
    }
}

using Shouldly;
using Xunit;

namespace PetOverlay.Tests;

public class PermissionBrokerTests
{
    private static readonly DateTime Asked = new(2026, 10, 15, 12, 0, 0, DateTimeKind.Utc);

    private static PermissionRequest Request(string id) => new(id, "hola.txt", null, null);

    [Fact]
    public void Take_answers_once_so_the_second_surface_finds_nothing()
    {
        var broker = new PermissionBroker();
        broker.Ask(Request("a"), Asked);

        broker.Take("a").ShouldNotBeNull();
        broker.Take("a").ShouldBeNull();
    }

    [Fact]
    public void Take_is_null_for_an_unknown_question()
    {
        new PermissionBroker().Take("nope").ShouldBeNull();
    }

    [Fact]
    public void TakeExpired_waits_the_full_two_minutes()
    {
        var broker = new PermissionBroker();
        broker.Ask(Request("a"), Asked);

        broker.TakeExpired(Asked + PermissionBroker.Timeout - TimeSpan.FromSeconds(1)).ShouldBeEmpty();
        broker.TakeExpired(Asked + PermissionBroker.Timeout).Select(r => r.RequestId).ShouldBe(new[] { "a" });
        broker.Take("a").ShouldBeNull();
    }

    [Fact]
    public void TakeExpired_leaves_newer_questions()
    {
        var broker = new PermissionBroker();
        broker.Ask(Request("old"), Asked);
        broker.Ask(Request("new"), Asked + TimeSpan.FromMinutes(1));

        broker.TakeExpired(Asked + PermissionBroker.Timeout).Select(r => r.RequestId).ShouldBe(new[] { "old" });
        broker.Take("new").ShouldNotBeNull();
    }

    [Fact]
    public void TakeAll_empties_the_queue()
    {
        var broker = new PermissionBroker();
        broker.Ask(Request("a"), Asked);
        broker.Ask(Request("b"), Asked);

        broker.TakeAll().Select(r => r.RequestId).OrderBy(id => id).ShouldBe(new[] { "a", "b" });
        broker.TakeAll().ShouldBeEmpty();
    }
}

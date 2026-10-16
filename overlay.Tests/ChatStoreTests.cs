using System.IO;
using Shouldly;
using Xunit;

namespace PetOverlay.Tests;

public sealed class ChatStoreTests : IDisposable
{
    private readonly string _path = Path.Combine(Path.GetTempPath(), $"claude-pet-chats-{Guid.NewGuid()}", "chats.json");

    public void Dispose()
    {
        var folder = Path.GetDirectoryName(_path)!;
        if (Directory.Exists(folder))
        {
            Directory.Delete(folder, recursive: true);
        }
    }

    [Fact]
    public void A_missing_file_has_nothing_saved()
    {
        var store = new ChatStore(_path);

        store.SessionFor("toji|c:\\repo").ShouldBeNull();
    }

    [Fact]
    public void A_save_that_cannot_be_written_is_lost_instead_of_crashing_the_pet()
    {
        var folder = Path.GetDirectoryName(_path)!;
        File.WriteAllText(folder, "a file where the folder should be");
        try
        {
            Should.NotThrow(() => new ChatStore(_path).Save("toji|c:\\repo", "715acc71"));
            new ChatStore(_path).SessionFor("toji|c:\\repo").ShouldBeNull();
        }
        finally
        {
            File.Delete(folder);
        }
    }

    [Fact]
    public void Saved_sessions_survive_a_new_store()
    {
        new ChatStore(_path).Save("toji|c:\\repo", "715acc71");

        new ChatStore(_path).SessionFor("toji|c:\\repo").ShouldBe("715acc71");
    }

    [Fact]
    public void Forget_removes_only_that_session()
    {
        var store = new ChatStore(_path);
        store.Save("toji|c:\\repo", "a");
        store.Save("itachi|c:\\repo", "b");

        store.Forget("toji|c:\\repo");

        store.SessionFor("toji|c:\\repo").ShouldBeNull();
        store.SessionFor("itachi|c:\\repo").ShouldBe("b");
    }

    [Fact]
    public void A_broken_file_starts_over()
    {
        Directory.CreateDirectory(Path.GetDirectoryName(_path)!);
        File.WriteAllText(_path, "{ not json");
        var store = new ChatStore(_path);

        store.SessionFor("toji|c:\\repo").ShouldBeNull();
        store.Save("toji|c:\\repo", "a");
        store.SessionFor("toji|c:\\repo").ShouldBe("a");
    }
}

package coding.structuredvibe.sdd

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class SddCliTest {
    @Test
    fun `buildCommand prefixes sdd binary`() {
        assertEquals(
            listOf("sdd", "init", "--here", "--ai", "copilot"),
            SddCli.buildCommand(listOf("init", "--here", "--ai", "copilot")),
        )
        assertEquals(
            listOf("sdd", "new", "Add feature", "-y"),
            SddCli.buildCommand(listOf("new", "Add feature", "-y")),
        )
        assertEquals(
            listOf("sdd", "agents", "refresh"),
            SddCli.buildCommand(listOf("agents", "refresh")),
        )
        assertEquals(
            listOf("/usr/local/bin/sdd", "status"),
            SddCli.buildCommand(listOf("status"), sddBinary = "/usr/local/bin/sdd"),
        )
    }

    @Test
    fun `agent install uses Speckit-style single AI flag`() {
        val install =
            SddCli.buildCommand(listOf("agents", "install", "--ai", "copilot", "--force"))
        assertEquals(
            listOf("sdd", "agents", "install", "--ai", "copilot", "--force"),
            install,
        )
    }
}

package coding.structuredvibe.sdd

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class SddCliTest {
    @Test
    fun `buildCommand prefixes sdd binary`() {
        assertEquals(
            listOf("sdd", "init"),
            SddCli.buildCommand(listOf("init")),
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
    fun `agent install and copilot paths are stable CLI surface`() {
        // Contract tests: IntelliJ + VS Code + CI all rely on these argv shapes
        val install = SddCli.buildCommand(listOf("agents", "install", "-t", "copilot,claude-code", "--force"))
        assertEquals("sdd", install[0])
        assertEquals("agents", install[1])
        assertEquals("install", install[2])
    }
}

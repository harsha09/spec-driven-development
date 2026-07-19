package coding.structuredvibe.sdd

import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.execution.process.CapturingProcessHandler
import com.intellij.execution.process.ProcessOutput
import com.intellij.openapi.project.Project
import java.nio.charset.StandardCharsets
import java.util.concurrent.TimeUnit

data class SddResult(val exitCode: Int, val stdout: String, val stderr: String) {
    val ok: Boolean get() = exitCode == 0
    val combined: String
        get() = listOf(stdout, stderr).filter { it.isNotBlank() }.joinToString("\n")
}

object SddCli {
    /**
     * Build argv for the sdd CLI. Exposed for unit tests.
     */
    fun buildCommand(args: List<String>, sddBinary: String = "sdd"): List<String> {
        return listOf(sddBinary) + args
    }

    fun run(project: Project, args: List<String>, timeoutSec: Long = 120): SddResult {
        val workDir = project.basePath
            ?: throw IllegalStateException("Open a project folder to use SDD.")
        val cmd = buildCommand(args)
        val cli = GeneralCommandLine(cmd)
            .withWorkDirectory(workDir)
            .withCharset(StandardCharsets.UTF_8)
            .withParentEnvironmentType(GeneralCommandLine.ParentEnvironmentType.CONSOLE)

        val handler = CapturingProcessHandler(cli)
        val output: ProcessOutput = handler.runProcess(TimeUnit.SECONDS.toMillis(timeoutSec).toInt())
        return SddResult(output.exitCode, output.stdout, output.stderr)
    }
}

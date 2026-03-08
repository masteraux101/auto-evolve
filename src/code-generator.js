import { upsert_file } from './tools'; // Assuming a tools module
import { planner, worker } from './ai-agents'; // Assuming AI agent modules

/**
 * @description Generates code based on a task and writes it to a file.
 * @param {string} taskDescription - The description of the task for the AI.
 * @param {string} outputPath - The path to write the generated code to.
 * @returns {Promise<object>} - The result of the file write operation.
 */
async function generateAndWriteCode(taskDescription, outputPath) {
  try {
    console.log(`Starting code generation for task: "${taskDescription}"`);

    // Step 1: Plan the implementation
    const plan = await planner.createPlan(taskDescription);
    console.log('Plan created:', plan);

    // Step 2: Generate the code based on the plan
    const generatedCode = await worker.generateCode(plan);
    console.log(`Code generated successfully. Writing to ${outputPath}...`);

    // Step 3: Write the generated code to the specified output file
    const writeResult = await upsert_file({
      path: outputPath,
      content: generatedCode,
      message: `feat: generate code for task "${taskDescription}"`,
      summary: `Automated code generation based on the task: ${taskDescription}. The output has been written to ${outputPath}.`
    });

    console.log('File written successfully:', writeResult);
    return writeResult;

  } catch (error) {
    console.error('An error occurred during the code generation process:', error);
    throw error;
  }
}

export { generateAndWriteCode };

// Example usage:
//
// import { generateAndWriteCode } from './code-generator';
//
// const task = "Create a function that sorts an array of numbers in ascending order.";
// const output = "output/generated_sort_function.js";
//
// generateAndWriteCode(task, output)
//   .then(result => console.log('Process complete.', result))
//   .catch(err => console.error('Process failed.', err));

# New code analysis tools
import ast
import re
from collections import deque

def run_linter(code_string):
    """
    Run basic linting checks on Python code.
    Returns a dictionary with 'errors', 'warnings', and 'passed' status.
    """
    issues = {
        'errors': [],
        'warnings': [],
        'passed': True
    }
    
    # Check 1: Syntax validation
    try:
        ast.parse(code_string)
    except SyntaxError as e:
        issues['errors'].append({
            'type': 'SyntaxError',
            'line': e.lineno,
            'message': str(e)
        })
        issues['passed'] = False
    except Exception as e:
        issues['errors'].append({
            'type': 'ParseError',
            'message': str(e)
        })
        issues['passed'] = False
    
    # Check 2: Import organization
    if 'import' in code_string:
        lines = code_string.split('\n')
        import_section_ended = False
        
        for i, line in enumerate(lines, 1):
            stripped = line.strip()
            if stripped.startswith('import ') or stripped.startswith('from '):
                if import_section_ended:
                    issues['warnings'].append({
                        'type': 'ImportOrder',
                        'line': i,
                        'message': 'Imports should be grouped at the top of the file'
                    })
            elif stripped and not stripped.startswith('#'):
                if (stripped.startswith('import ') or stripped.startswith('from ')):
                    pass
                else:
                    import_section_ended = True
    
    # Check 3: Line length (PEP 8 recommends max 79 chars)
    lines = code_string.split('\n')
    for i, line in enumerate(lines, 1):
        if len(line) > 100:
            issues['warnings'].append({
                'type': 'LineTooLong',
                'line': i,
                'message': f'Line is too long ({len(line)} > 100 characters)'
            })
    
    # Check 4: Unused variables detection (simple regex-based)
    unused_vars = []
    var_pattern = re.compile(r'^(\s+)?(\w+)\s*=\s*[^=]')
    for i, line in enumerate(lines, 1):
        match = var_pattern.match(line)
        if match:
            var_name = match.group(2)
            # Check if variable is used later in the code
            rest_of_code = '\n'.join(lines[i:])
            if re.search(rf'\b{var_name}\b', rest_of_code):
                continue
            # Ignore common patterns like '_'
            if var_name != '_':
                unused_vars.append({
                    'type': 'UnusedVariable',
                    'line': i,
                    'variable': var_name,
                    'message': f'Variable "{var_name}" defined but not used'
                })
    
    issues['warnings'].extend(unused_vars)
    issues['passed'] = len(issues['errors']) == 0
    return issues


def check_complexity(code_string):
    """
    Check cyclomatic complexity and other metrics of Python code.
    Returns a dictionary with complexity scores and recommendations.
    """
    metrics = {
        'cyclomatic_complexity': 0,
        'function_count': 0,
        'max_nesting_level': 0,
        'average_function_length': 0,
        'issues': [],
        'passed': True
    }
    
    try:
        tree = ast.parse(code_string)
    except Exception as e:
        metrics['issues'].append({
            'type': 'ParseError',
            'message': f'Cannot parse code: {str(e)}'
        })
        metrics['passed'] = False
        return metrics
    
    lines = code_string.split('\n')
    
    # Calculate cyclomatic complexity
    decision_points = 0
    for line in lines:
        # Count decision keywords: if, elif, for, while, except, and, or
        decision_points += len(re.findall(r'\b(if|elif|for|while|except|and|or)\b', line))
    
    metrics['cyclomatic_complexity'] = max(1, decision_points + 1)
    
    # Count functions
    function_nodes = [node for node in ast.walk(tree) if isinstance(node, ast.FunctionDef)]
    metrics['function_count'] = len(function_nodes)
    
    # Calculate max nesting level
    max_nesting = 0
    
    class NestingVisitor(ast.NodeVisitor):
        def __init__(self):
            self.nesting_level = 0
            self.max_nesting = 0
        
        def generic_visit(self, node):
            if isinstance(node, (ast.If, ast.For, ast.While, ast.With, ast.FunctionDef)):
                self.nesting_level += 1
                self.max_nesting = max(self.max_nesting, self.nesting_level)
            
            super().generic_visit(node)
            
            if isinstance(node, (ast.If, ast.For, ast.While, ast.With, ast.FunctionDef)):
                self.nesting_level -= 1
    
    visitor = NestingVisitor()
    visitor.visit(tree)
    metrics['max_nesting_level'] = visitor.max_nesting
    
    # Calculate average function length
    if function_nodes:
        total_lines = 0
        for func in function_nodes:
            func_lines = func.end_lineno - func.lineno + 1 if hasattr(func, 'end_lineno') else 10
            total_lines += func_lines
        metrics['average_function_length'] = total_lines // len(function_nodes)
    
    # Generate recommendations
    if metrics['cyclomatic_complexity'] > 10:
        metrics['issues'].append({
            'severity': 'warning',
            'metric': 'cyclomatic_complexity',
            'value': metrics['cyclomatic_complexity'],
            'message': 'High cyclomatic complexity - consider breaking down functions'
        })
    
    if metrics['max_nesting_level'] > 4:
        metrics['issues'].append({
            'severity': 'warning',
            'metric': 'nesting_level',
            'value': metrics['max_nesting_level'],
            'message': 'Deep nesting detected - consider refactoring'
        })
    
    if metrics['function_count'] < 1:
        metrics['issues'].append({
            'severity': 'info',
            'metric': 'function_count',
            'message': 'No functions found in code'
        })
    
    if metrics['average_function_length'] > 50:
        metrics['issues'].append({
            'severity': 'warning',
            'metric': 'function_length',
            'value': metrics['average_function_length'],
            'message': 'Average function length is too long - consider breaking down'
        })
    
    metrics['passed'] = len([i for i in metrics['issues'] if i.get('severity') == 'error']) == 0
    return metrics

`timescale 1ns/1ps
// Lab-First control scaffold / electrical integration PLACEHOLDER.
// Abstract synchronous permits/handshakes; no topology scanner, switching,
// protection circuit, transport framing or board pin/timing implementation.
module netcircuit_experiment_top (
    input wire clk,
    input wire reset_n,
    input wire command_valid,
    input wire [7:0] command_code,
    input wire safe_condition,
    input wire scan_done,
    input wire scan_success,
    input wire plan_valid,
    input wire routing_ready,
    input wire protection_ready,
    input wire watchdog_armed,
    input wire watchdog_expired,
    input wire fault_in,
    input wire [31:0] clock_half_period_ticks,
    output reg command_accepted,
    output reg [3:0] error_code,
    output reg [3:0] state,
    output wire topology_scan_enable,
    output wire routing_enable,
    output wire drive_enable,
    output wire experiment_clock,
    output wire safe_state,
    output wire status_led
);
    localparam SAFE=4'd0, SCANNING=4'd1, SCANNED=4'd2, PREPARED=4'd3,
               ROUTED=4'd4, POWERED=4'd5, ARMED=4'd6, RUNNING=4'd7, FAULT=4'd8;
    // Simulation/control-boundary IDs only; not physical transport packet IDs.
    localparam CMD_SAFE_STATE=8'd0, CMD_SCAN_BEGIN=8'd1, CMD_PREPARE=8'd2,
               CMD_ROUTE_APPLY=8'd3, CMD_POWER_UP=8'd4, CMD_ARM=8'd5,
               CMD_START=8'd6, CMD_STOP=8'd7, CMD_RESET=8'd8, CMD_STATUS=8'd9;
    localparam OK=4'd0, INVALID_STATE=4'd1, SAFETY_BLOCK=4'd2,
               SCAN_FAILED=4'd3, INVALID_COMMAND=4'd4, INTERLOCK_FAULT=4'd5;
    reg [31:0] half_period;
    reg [31:0] clock_count;
    reg clock_phase;
    wire powered = (state==POWERED || state==ARMED || state==RUNNING);
    wire immediate_fault = fault_in || watchdog_expired;
    wire permitted = reset_n && !fault_in && !watchdog_expired && safe_condition;
    wire protected_permit = permitted && protection_ready && watchdog_armed && plan_valid && routing_ready;
    assign topology_scan_enable = reset_n && !fault_in && !watchdog_expired && state==SCANNING;
    assign routing_enable = permitted && routing_ready && (state==ROUTED || powered);
    assign drive_enable = protected_permit && powered;
    assign experiment_clock = drive_enable && state==RUNNING && clock_phase;
    assign safe_state = !routing_enable && !drive_enable;
    assign status_led = reset_n && state==RUNNING;

    task reject_command;
        input [3:0] reason;
        begin
            command_accepted <= 1'b0;
            error_code <= reason;
            if (state!=FAULT) state <= SAFE;
        end
    endtask

    always @(posedge clk or negedge reset_n or posedge immediate_fault) begin
        if (!reset_n) begin
            state <= SAFE; command_accepted <= 1'b0; error_code <= OK;
            half_period <= 32'd0; clock_count <= 32'd0; clock_phase <= 1'b0;
        end else if (immediate_fault) begin
            state <= FAULT; command_accepted <= 1'b0; error_code <= INTERLOCK_FAULT;
            clock_count <= 32'd0; clock_phase <= 1'b0;
        end else begin
            command_accepted <= 1'b0;
            if (state==RUNNING && drive_enable) begin
                if (clock_count==half_period-1'b1) begin
                    clock_count <= 32'd0; clock_phase <= !clock_phase;
                end else clock_count <= clock_count+1'b1;
            end else begin clock_count <= 32'd0; clock_phase <= 1'b0; end
            if (powered && !protected_permit) begin
                state <= FAULT; error_code <= INTERLOCK_FAULT;
            end else if (state==SCANNING && scan_done && (!command_valid || command_code==CMD_STATUS)) begin
                // A read-only STATUS poll cannot consume scanner completion.
                if (scan_success) begin state <= SCANNED; error_code <= OK; end
                else begin state <= SAFE; error_code <= SCAN_FAILED; end
                if (command_valid) command_accepted <= 1'b1;
            end else if (command_valid) begin
                error_code <= OK;
                case (command_code)
                    CMD_SAFE_STATE, CMD_STOP: begin
                        if (state!=FAULT) state <= SAFE;
                        command_accepted <= 1'b1;
                    end
                    CMD_RESET: begin
                        state <= SAFE; command_accepted <= 1'b1;
                        half_period <= 32'd0; clock_count <= 32'd0; clock_phase <= 1'b0;
                    end
                    CMD_STATUS: command_accepted <= 1'b1;
                    CMD_SCAN_BEGIN:
                        if (state==SAFE) begin state <= SCANNING; command_accepted <= 1'b1; end
                        else reject_command(INVALID_STATE);
                    CMD_PREPARE:
                        if (state!=SCANNED) reject_command(INVALID_STATE);
                        else if (!safe_condition || !plan_valid || clock_half_period_ticks==0) reject_command(SAFETY_BLOCK);
                        else begin
                            state <= PREPARED; half_period <= clock_half_period_ticks;
                            command_accepted <= 1'b1;
                        end
                    CMD_ROUTE_APPLY:
                        if (state!=PREPARED) reject_command(INVALID_STATE);
                        else if (!safe_condition || !plan_valid || !routing_ready) reject_command(SAFETY_BLOCK);
                        else begin state <= ROUTED; command_accepted <= 1'b1; end
                    CMD_POWER_UP:
                        if (state!=ROUTED) reject_command(INVALID_STATE);
                        else if (!protected_permit || !routing_ready) reject_command(SAFETY_BLOCK);
                        else begin state <= POWERED; command_accepted <= 1'b1; end
                    CMD_ARM:
                        if (state==POWERED && protected_permit) begin state <= ARMED; command_accepted <= 1'b1; end
                        else reject_command(INVALID_STATE);
                    CMD_START:
                        if (state==ARMED && protected_permit && half_period!=0) begin state <= RUNNING; command_accepted <= 1'b1; end
                        else reject_command(INVALID_STATE);
                    default: reject_command(INVALID_COMMAND);
                endcase
            end
        end
    end
endmodule

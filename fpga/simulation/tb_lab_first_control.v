`timescale 1ns/1ps
// Software control/interlock simulation only; never electrical evidence.
module tb_lab_first_control;
    reg clk=0;
    always #5 clk=~clk;
    reg reset_n=0, command_valid=0;
    reg [7:0] command_code=0;
    reg safe_condition=0, scan_done=0, scan_success=0, plan_valid=0;
    reg routing_ready=0, protection_ready=0, watchdog_armed=0;
    reg watchdog_expired=0, fault_in=0;
    reg [31:0] clock_half_period_ticks=3;
    wire command_accepted, topology_scan_enable, routing_enable, drive_enable;
    wire experiment_clock, safe_state, status_led;
    wire [3:0] error_code,state;
    wire la_available,scope_available,generator_available,capture_valid,output_enable,sdram_request;
    integer i,seen_high;

    netcircuit_experiment_top dut (
        .clk(clk),.reset_n(reset_n),.command_valid(command_valid),.command_code(command_code),
        .safe_condition(safe_condition),.scan_done(scan_done),.scan_success(scan_success),
        .plan_valid(plan_valid),.routing_ready(routing_ready),.protection_ready(protection_ready),
        .watchdog_armed(watchdog_armed),.watchdog_expired(watchdog_expired),.fault_in(fault_in),
        .clock_half_period_ticks(clock_half_period_ticks),.command_accepted(command_accepted),
        .error_code(error_code),.state(state),.topology_scan_enable(topology_scan_enable),
        .routing_enable(routing_enable),.drive_enable(drive_enable),.experiment_clock(experiment_clock),
        .safe_state(safe_state),.status_led(status_led));
    netcircuit_instrument_scaffold instruments (
        .control_clk(clk),.acquisition_clk(clk),.generator_clk(clk),.sdram_clk(clk),.reset_n(reset_n),
        .capture_request(1'b1),.generator_request(1'b1),.logic_analyzer_available(la_available),
        .scope_2ch_available(scope_available),.generator_2ch_available(generator_available),
        .capture_valid(capture_valid),.generator_output_enable(output_enable),.sdram_request(sdram_request));

    task check_safe;
        begin
            if (drive_enable!==0 || routing_enable!==0 || experiment_clock!==0 || safe_state!==1)
                $fatal(1,"unsafe outputs in state %d",state);
        end
    endtask
    task send_command;
        input [7:0] code;
        input expected_accept;
        begin
            @(negedge clk); command_code=code; command_valid=1;
            @(posedge clk); #1;
            if (command_accepted!==expected_accept) $fatal(1,"command %d unexpected ack",code);
            @(negedge clk); command_valid=0;
        end
    endtask
    task scan;
        begin
            send_command(1,1);
            if (!topology_scan_enable || drive_enable || routing_enable) $fatal(1,"scan guard failed");
            // A STATUS poll must not swallow the one-cycle completion pulse.
            scan_done=1; scan_success=1; command_valid=1; command_code=9;
            @(posedge clk); #1;
            if (state!==2 || !command_accepted) $fatal(1,"STATUS swallowed scan completion");
            @(negedge clk); scan_done=0; command_valid=0;
        end
    endtask
    task start_valid;
        begin
            scan(); send_command(2,1); send_command(3,1);
            if (!routing_enable || drive_enable) $fatal(1,"routing energized drive");
            send_command(4,1); send_command(5,1); send_command(6,1);
            if (!drive_enable || state!==7) $fatal(1,"valid sequence did not run");
        end
    endtask

    initial begin
        #1; check_safe();
        #1; reset_n=1;
        send_command(6,0); check_safe(); // Start cannot bypass scan/prepare/arm.
        send_command(3,0); check_safe(); // Route defaults open.
        scan(); plan_valid=1;
        send_command(2,0); check_safe(); // Explicit safe condition required.
        safe_condition=1; routing_ready=1;
        scan(); send_command(2,1); send_command(3,1);
        send_command(4,0); check_safe(); // Protection/watchdog required.
        protection_ready=1; watchdog_armed=1;
        start_valid();
        seen_high=0;
        for (i=0;i<8;i=i+1) begin @(posedge clk); #1; if (experiment_clock) seen_high=1; end
        if (!seen_high) $fatal(1,"experiment clock did not toggle");
        @(negedge clk); fault_in=1; #1; check_safe();
        fault_in=0; #1; check_safe(); // Short async pulse remains latched.
        send_command(6,0); check_safe();
        send_command(8,1); check_safe(); // Reset invalidates previous scan/plan.
        send_command(6,0); check_safe();
        start_valid();
        @(negedge clk); watchdog_expired=1; #1; check_safe();
        watchdog_expired=0; send_command(8,1);
        start_valid(); routing_ready=0; #1;
        if (drive_enable || routing_enable) $fatal(1,"lost routing permit did not disable");
        @(posedge clk); #1; check_safe();
        routing_ready=1; send_command(8,1);
        start_valid(); send_command(255,0); check_safe();
        start_valid(); send_command(7,1); check_safe();
        start_valid(); reset_n=0; #1; check_safe();
        if (la_available || scope_available || generator_available || capture_valid || output_enable || sdram_request)
            $fatal(1,"unimplemented instrument fabricated availability/data");
        $display("LAB_FIRST_RTL_PASS"); $finish;
    end
    initial begin #10000; $fatal(1,"testbench timeout"); end
endmodule
